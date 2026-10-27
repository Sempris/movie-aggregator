import { Injectable, Logger } from '@nestjs/common';
import type { ProviderId, ProviderSyncStatus, SourceId } from '@ratemix/shared';
import { PrismaService } from '../core/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  AdapterResult,
  MovieMetadataPatch,
  MovieRef,
  NormalizedRating,
} from '../sources/adapter.types';
import {
  type TmdbMovieSummary,
  metadataFromSummary,
  tmdbRating,
} from '../sources/tmdb/tmdb.client';

type Tx = Prisma.TransactionClient;
export type CatalogList = 'trending' | 'popular';

export interface RefreshCandidate {
  id: string;
  releaseDate: Date | null;
  lastAttemptAt: Date | null;
  listed: boolean;
}

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** All writes produced by ingestion: movies, ratings, sync bookkeeping and curated lists. */
@Injectable()
export class RatingsRepository {
  private readonly logger = new Logger(RatingsRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  getMovieRef(movieId: string): Promise<MovieRef | null> {
    return this.prisma.movie.findUnique({
      where: { id: movieId },
      select: { id: true, tmdbId: true, imdbId: true, title: true, releaseYear: true },
    });
  }

  /**
   * Upserts titles from TMDB list/search payloads (metadata plus the TMDB score they
   * already carry). Returns internal IDs in input order; adult titles are skipped.
   */
  async upsertFromTmdbSummaries(
    summaries: readonly TmdbMovieSummary[],
    now: Date,
  ): Promise<string[]> {
    const eligible = summaries.filter((summary) => !summary.adult && summary.title);
    return this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const summary of eligible) {
        const metadata = definedOnly(metadataFromSummary(summary));
        const movie = await tx.movie.upsert({
          where: { tmdbId: summary.id },
          create: { tmdbId: summary.id, title: summary.title, ...metadata },
          update: metadata,
          select: { id: true },
        });
        const rating = tmdbRating(summary);
        if (rating) await this.upsertRating(tx, movie.id, 'tmdb', rating, now);
        ids.push(movie.id);
      }
      return ids;
    });
  }

  /** Ensures a movie row exists for a TMDB ID (used when opening a title not yet in the catalog). */
  async ensureMovie(tmdbId: number, title: string): Promise<string> {
    const movie = await this.prisma.movie.upsert({
      where: { tmdbId },
      create: { tmdbId, title },
      update: {},
      select: { id: true },
    });
    return movie.id;
  }

  /** Persists one adapter call: ratings, metadata and the provider's sync state, atomically. */
  async applyAdapterResult(
    movieId: string,
    provider: ProviderId,
    sourceIds: readonly SourceId[],
    result: AdapterResult,
    now: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (result.status === 'ok') {
        if (result.metadata) {
          await this.applyMetadata(tx, movieId, result.metadata, provider === 'tmdb' ? now : null);
        }
        for (const sourceId of sourceIds) {
          const rating = result.ratings[sourceId];
          if (rating) await this.upsertRating(tx, movieId, sourceId, rating, now);
          else await tx.movieRating.deleteMany({ where: { movieId, sourceId } });
        }
      } else if (result.status === 'not_found') {
        await tx.movieRating.deleteMany({ where: { movieId, sourceId: { in: [...sourceIds] } } });
      }

      const ok = result.status === 'ok';
      const message = result.status === 'ok' ? null : (result.message ?? null);
      await tx.movieProviderSync.upsert({
        where: { movieId_provider: { movieId, provider } },
        create: {
          movieId,
          provider,
          status: result.status,
          lastAttemptAt: now,
          lastSuccessAt: ok ? now : null,
          lastError: message,
        },
        update: {
          status: result.status,
          queuedAt: null,
          lastAttemptAt: now,
          lastError: message,
          ...(ok ? { lastSuccessAt: now } : {}),
        },
      });
    });
  }

  /** Records a status without touching ratings (errors, deferrals, skipped follow-ups). */
  async recordStatus(
    movieId: string,
    providers: readonly ProviderId[],
    status: ProviderSyncStatus,
    message: string | null,
    now: Date,
    options: { countsAsAttempt: boolean },
  ): Promise<void> {
    await this.prisma.$transaction(
      providers.map((provider) =>
        this.prisma.movieProviderSync.upsert({
          where: { movieId_provider: { movieId, provider } },
          create: {
            movieId,
            provider,
            status,
            lastError: message,
            lastAttemptAt: options.countsAsAttempt ? now : null,
          },
          update: {
            status,
            lastError: message,
            queuedAt: null,
            ...(options.countsAsAttempt ? { lastAttemptAt: now } : {}),
          },
        }),
      ),
    );
  }

  async markQueued(movieId: string, providers: readonly ProviderId[], now: Date): Promise<void> {
    if (providers.length === 0) return;
    await this.prisma.$transaction(
      providers.map((provider) =>
        this.prisma.movieProviderSync.upsert({
          where: { movieId_provider: { movieId, provider } },
          create: { movieId, provider, status: 'queued', queuedAt: now },
          update: { status: 'queued', queuedAt: now },
        }),
      ),
    );
  }

  /** Throttled to one write per hour per title. */
  async touchViewed(movieId: string, now: Date): Promise<void> {
    const threshold = new Date(now.getTime() - 3600_000);
    await this.prisma.movie.updateMany({
      where: { id: movieId, OR: [{ lastViewedAt: null }, { lastViewedAt: { lt: threshold } }] },
      data: { lastViewedAt: now },
    });
  }

  /**
   * Titles whose last attempt for `provider` is older than `attemptCutoff`, limited to
   * titles people look at (curated lists or viewed recently). Oldest first.
   */
  findRefreshCandidates(options: {
    provider: ProviderId;
    attemptCutoff: Date;
    viewedSince: Date;
    staleQueuedCutoff: Date;
    requireImdbId: boolean;
    limit: number;
  }): Promise<RefreshCandidate[]> {
    const { provider, attemptCutoff, viewedSince, staleQueuedCutoff, requireImdbId, limit } =
      options;
    return this.prisma.$queryRaw<RefreshCandidate[]>`
      SELECT m.id,
             m.release_date AS "releaseDate",
             s.last_attempt_at AS "lastAttemptAt",
             EXISTS (SELECT 1 FROM movie_list_entries l WHERE l.movie_id = m.id) AS listed
      FROM movies m
      LEFT JOIN movie_provider_sync s ON s.movie_id = m.id AND s.provider = ${provider}
      WHERE (s.last_attempt_at IS NULL OR s.last_attempt_at < ${attemptCutoff})
        AND (s.status IS DISTINCT FROM 'queued' OR s.queued_at < ${staleQueuedCutoff})
        AND (
          m.last_viewed_at >= ${viewedSince}
          OR EXISTS (SELECT 1 FROM movie_list_entries l WHERE l.movie_id = m.id)
        )
        ${requireImdbId ? Prisma.sql`AND m.imdb_id IS NOT NULL` : Prisma.empty}
      ORDER BY s.last_attempt_at ASC NULLS FIRST
      LIMIT ${limit}
    `;
  }

  async replaceList(list: CatalogList, movieIds: readonly string[], now: Date): Promise<void> {
    const unique = [...new Set(movieIds)];
    await this.prisma.$transaction([
      this.prisma.movieListEntry.deleteMany({ where: { list } }),
      this.prisma.movieListEntry.createMany({
        data: unique.map((movieId, index) => ({ list, rank: index + 1, movieId, syncedAt: now })),
      }),
    ]);
  }

  async getList(list: CatalogList): Promise<{ movieIds: string[]; syncedAt: Date | null }> {
    const entries = await this.prisma.movieListEntry.findMany({
      where: { list },
      orderBy: { rank: 'asc' },
      select: { movieId: true, syncedAt: true },
    });
    return {
      movieIds: entries.map((entry) => entry.movieId),
      syncedAt: entries[0]?.syncedAt ?? null,
    };
  }

  /** Fallback title search over already-ingested titles. */
  async searchLocal(query: string, page: number, pageSize: number): Promise<string[]> {
    const rows = await this.prisma.movie.findMany({
      where: { title: { contains: query, mode: 'insensitive' } },
      orderBy: [{ popularity: { sort: 'desc', nulls: 'last' } }, { title: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  countMovies(): Promise<number> {
    return this.prisma.movie.count();
  }

  private async upsertRating(
    tx: Tx,
    movieId: string,
    sourceId: SourceId,
    rating: NormalizedRating,
    now: Date,
  ): Promise<void> {
    const data = {
      rawValue: rating.rawValue,
      normalizedValue: rating.normalizedValue,
      voteCount: rating.voteCount ?? null,
      rawPayload: (rating.rawPayload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      fetchedAt: now,
    };
    await tx.movieRating.upsert({
      where: { movieId_sourceId: { movieId, sourceId } },
      create: { movieId, sourceId, ...data },
      update: data,
    });
  }

  private async applyMetadata(
    tx: Tx,
    movieId: string,
    patch: MovieMetadataPatch,
    detailsFetchedAt: Date | null,
  ): Promise<void> {
    const { imdbId, ...rest } = patch;
    const update: Prisma.MovieUpdateInput = definedOnly(rest);
    if (detailsFetchedAt) update.detailsFetchedAt = detailsFetchedAt;

    if (imdbId) {
      // Remakes and regional cuts occasionally map to the same IMDb ID on TMDB.
      // Keep the first link rather than failing the whole ingestion on the unique constraint.
      const clash = await tx.movie.findFirst({
        where: { imdbId, NOT: { id: movieId } },
        select: { tmdbId: true },
      });
      if (clash) {
        this.logger.warn(
          { movieId, imdbId, linkedTmdbId: clash.tmdbId },
          'IMDb ID already linked to another title; leaving it unset (needs manual correction)',
        );
      } else {
        update.imdbId = imdbId;
      }
    }
    await tx.movie.update({ where: { id: movieId }, data: update });
  }
}
