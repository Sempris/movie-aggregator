import { Injectable, Logger } from '@nestjs/common';
import { type ProviderSyncStatus, isProviderId, isSourceId } from '@ratemix/shared';
import { errorMessage } from '../common/errors';
import { PrismaService } from '../core/prisma.service';
import { RedisService } from '../core/redis.service';
import type { CachedMovie } from './cached-movie';

const MOVIE_KEY = (id: string) => `movie:v1:${id}`;
const TMDB_KEY = (tmdbId: number) => `movie:tmdb:${tmdbId}`;
/** Memory safety net only; freshness comes from invalidation on every ingestion write. */
const SAFETY_TTL_SECONDS = 7 * 24 * 3600;

/**
 * Read-through Redis cache for movie + ratings snapshots. Redis being unavailable
 * degrades to direct Postgres reads rather than failing requests.
 */
@Injectable()
export class MovieCacheService {
  private readonly logger = new Logger(MovieCacheService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async get(id: string): Promise<CachedMovie | null> {
    return (await this.getMany([id])).get(id) ?? null;
  }

  async getMany(ids: readonly string[]): Promise<Map<string, CachedMovie>> {
    const unique = [...new Set(ids)];
    const found = new Map<string, CachedMovie>();
    if (unique.length === 0) return found;

    let misses = unique;
    try {
      const values = await this.redis.client.mget(unique.map(MOVIE_KEY));
      misses = [];
      values.forEach((value, index) => {
        const id = unique[index]!;
        if (value) found.set(id, JSON.parse(value) as CachedMovie);
        else misses.push(id);
      });
    } catch (error) {
      this.logger.debug({ err: errorMessage(error) }, 'Movie cache read failed; using database');
    }

    if (misses.length > 0) {
      const loaded = await this.loadFromDatabase(misses);
      for (const movie of loaded) found.set(movie.id, movie);
      await this.write(loaded);
    }
    return found;
  }

  async findIdByTmdbId(tmdbId: number): Promise<string | null> {
    try {
      const cached = await this.redis.client.get(TMDB_KEY(tmdbId));
      if (cached) return cached;
    } catch {
      // fall through to the database
    }
    const row = await this.prisma.movie.findUnique({ where: { tmdbId }, select: { id: true } });
    if (row) {
      // tmdb_id -> id never changes, so this mapping can live as long as the safety TTL.
      await this.redis.client
        .set(TMDB_KEY(tmdbId), row.id, 'EX', SAFETY_TTL_SECONDS)
        .catch(() => undefined);
    }
    return row?.id ?? null;
  }

  async invalidate(ids: string | readonly string[]): Promise<void> {
    const keys = (typeof ids === 'string' ? [ids] : [...ids]).map(MOVIE_KEY);
    if (keys.length === 0) return;
    try {
      await this.redis.client.del(...keys);
    } catch (error) {
      this.logger.warn(
        { err: errorMessage(error), keys: keys.length },
        'Movie cache invalidation failed',
      );
    }
  }

  private async write(movies: readonly CachedMovie[]): Promise<void> {
    if (movies.length === 0) return;
    try {
      const pipeline = this.redis.client.pipeline();
      for (const movie of movies) {
        pipeline.set(MOVIE_KEY(movie.id), JSON.stringify(movie), 'EX', SAFETY_TTL_SECONDS);
      }
      await pipeline.exec();
    } catch {
      // cache writes are best-effort
    }
  }

  private async loadFromDatabase(ids: readonly string[]): Promise<CachedMovie[]> {
    const rows = await this.prisma.movie.findMany({
      where: { id: { in: [...ids] } },
      include: { ratings: true, syncStates: true },
    });
    const iso = (date: Date | null) => (date ? date.toISOString() : null);
    return rows.map((row) => ({
      id: row.id,
      tmdbId: row.tmdbId,
      imdbId: row.imdbId,
      title: row.title,
      originalTitle: row.originalTitle,
      overview: row.overview,
      releaseDate: row.releaseDate ? row.releaseDate.toISOString().slice(0, 10) : null,
      releaseYear: row.releaseYear,
      posterPath: row.posterPath,
      backdropPath: row.backdropPath,
      runtimeMinutes: row.runtimeMinutes,
      genres: row.genres,
      detailsFetchedAt: iso(row.detailsFetchedAt),
      ratings: row.ratings.flatMap((rating) =>
        isSourceId(rating.sourceId)
          ? [
              {
                sourceId: rating.sourceId,
                rawValue: rating.rawValue,
                normalizedValue: rating.normalizedValue,
                voteCount: rating.voteCount,
                fetchedAt: rating.fetchedAt.toISOString(),
              },
            ]
          : [],
      ),
      syncs: row.syncStates.flatMap((sync) =>
        isProviderId(sync.provider)
          ? [
              {
                provider: sync.provider,
                status: sync.status as ProviderSyncStatus,
                queuedAt: iso(sync.queuedAt),
                lastAttemptAt: iso(sync.lastAttemptAt),
                lastSuccessAt: iso(sync.lastSuccessAt),
                lastError: sync.lastError,
              },
            ]
          : [],
      ),
    }));
  }
}
