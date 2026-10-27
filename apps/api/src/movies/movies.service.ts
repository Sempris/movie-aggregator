import { Injectable, Logger } from '@nestjs/common';
import type {
  MovieByTmdbIdInput,
  MovieDetailDto,
  MovieListDto,
  MovieSearchDto,
  SearchMoviesInput,
} from '@ratemix/shared';
import { TRPCError } from '@trpc/server';
import type { CachedMovie } from '../catalog/cached-movie';
import { IngestionService } from '../catalog/ingestion.service';
import { MovieCacheService } from '../catalog/movie-cache.service';
import { type CatalogList, RatingsRepository } from '../catalog/ratings.repository';
import { SourcesService } from '../catalog/sources.service';
import { errorMessage } from '../common/errors';
import { RedisService } from '../core/redis.service';
import { PreferencesService } from '../preferences/preferences.service';
import { AdapterRegistry } from '../sources/adapter-registry';
import { TmdbAdapter } from '../sources/tmdb/tmdb.adapter';
import { TmdbClient } from '../sources/tmdb/tmdb.client';
import type { MoviesApi, Viewer } from '../trpc/deps';
import { toDetailDto, toSummaryDto } from './movie-mapper';

const SEARCH_CACHE_SECONDS = 6 * 3600;
/** Top search results get their missing ratings fetched in the background. */
const SEARCH_PREFETCH_COUNT = 3;

interface CachedSearch {
  totalPages: number;
  movieIds: string[];
}

@Injectable()
export class MoviesService implements MoviesApi {
  private readonly logger = new Logger(MoviesService.name);
  private readonly listBootstrap = new Map<CatalogList, Promise<void>>();

  constructor(
    private readonly tmdb: TmdbClient,
    private readonly repository: RatingsRepository,
    private readonly cache: MovieCacheService,
    private readonly ingestion: IngestionService,
    private readonly preferences: PreferencesService,
    private readonly sources: SourcesService,
    private readonly registry: AdapterRegistry,
    private readonly redis: RedisService,
  ) {}

  /**
   * Live TMDB catalog search (cached for a few hours), falling back to titles already
   * in Postgres when TMDB is unavailable or not configured.
   */
  async search(input: SearchMoviesInput, _viewer: Viewer): Promise<MovieSearchDto> {
    const query = input.query.trim();
    const now = new Date();
    const definitions = await this.sources.definitions();

    if (this.tmdb.isConfigured()) {
      try {
        const found = await this.searchTmdb(query, input.page, now);
        const movies = await this.cache.getMany(found.movieIds);
        const ordered = found.movieIds.flatMap((id) => (movies.has(id) ? [movies.get(id)!] : []));
        void this.prefetch(ordered.slice(0, SEARCH_PREFETCH_COUNT), now);
        return {
          query,
          page: input.page,
          totalPages: found.totalPages,
          origin: 'tmdb',
          results: ordered.map((movie) => toSummaryDto(movie, definitions, now)),
        };
      } catch (error) {
        this.logger.warn(
          { err: errorMessage(error) },
          'TMDB search failed; searching local catalog',
        );
      }
    }

    const pageSize = 20;
    const ids = await this.repository.searchLocal(query, input.page, pageSize);
    const movies = await this.cache.getMany(ids);
    return {
      query,
      page: input.page,
      totalPages: ids.length === pageSize ? input.page + 1 : input.page,
      origin: 'local',
      results: ids.flatMap((id) => {
        const movie = movies.get(id);
        return movie ? [toSummaryDto(movie, definitions, now)] : [];
      }),
    };
  }

  async getById(input: MovieByTmdbIdInput, viewer: Viewer): Promise<MovieDetailDto> {
    const now = new Date();
    let movie = await this.loadByTmdbId(input.tmdbId);

    if (!movie || !movie.detailsFetchedAt) {
      movie = (await this.importDetails(input.tmdbId, movie, now)) ?? movie;
    }
    if (!movie) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'This title is not in the catalog' });
    }

    const requested = await this.ingestion.ensureRatings(movie, 'on_demand', now);
    if (requested.length > 0) movie = (await this.cache.get(movie.id)) ?? movie;
    void this.repository.touchViewed(movie.id, now).catch(() => undefined);

    const [definitions, preferences] = await Promise.all([
      this.sources.definitions(),
      this.preferences.resolveFor(viewer.userId),
    ]);
    return toDetailDto(movie, definitions, this.registry.configuredMap(), preferences, now);
  }

  trending(): Promise<MovieListDto> {
    return this.list('trending');
  }

  popular(): Promise<MovieListDto> {
    return this.list('popular');
  }

  private async list(list: CatalogList): Promise<MovieListDto> {
    let entries = await this.repository.getList(list);
    if (entries.movieIds.length === 0 && this.tmdb.isConfigured()) {
      // First run before the worker's catalog sync: fill the list once, shared by concurrent requests.
      let pending = this.listBootstrap.get(list);
      if (!pending) {
        pending = this.bootstrapList(list).finally(() => this.listBootstrap.delete(list));
        this.listBootstrap.set(list, pending);
      }
      await pending.catch((error) =>
        this.logger.warn({ list, err: errorMessage(error) }, 'Could not bootstrap list from TMDB'),
      );
      entries = await this.repository.getList(list);
    }
    const now = new Date();
    const [movies, definitions] = await Promise.all([
      this.cache.getMany(entries.movieIds),
      this.sources.definitions(),
    ]);
    return {
      syncedAt: entries.syncedAt?.toISOString() ?? null,
      movies: entries.movieIds.flatMap((id) => {
        const movie = movies.get(id);
        return movie ? [toSummaryDto(movie, definitions, now)] : [];
      }),
    };
  }

  private async bootstrapList(list: CatalogList): Promise<void> {
    const now = new Date();
    const summaries =
      list === 'trending' ? await this.tmdb.trending('day') : await this.tmdb.popular(1);
    const ids = await this.repository.upsertFromTmdbSummaries(summaries, now);
    await this.repository.replaceList(list, ids, now);
    await this.cache.invalidate(ids);
    void this.prefetch([...(await this.cache.getMany(ids)).values()], now);
  }

  private async loadByTmdbId(tmdbId: number): Promise<CachedMovie | null> {
    const id = await this.cache.findIdByTmdbId(tmdbId);
    return id ? this.cache.get(id) : null;
  }

  /**
   * Catalog miss: TMDB is the catalog, so fetch its details synchronously (it's fast and
   * generously rate limited). Rating-only providers are never called on the request path.
   */
  private async importDetails(
    tmdbId: number,
    existing: CachedMovie | null,
    now: Date,
  ): Promise<CachedMovie | null> {
    if (!this.tmdb.isConfigured()) return null;
    try {
      const details = await this.tmdb.getMovieDetails(tmdbId);
      if (!details) return null;
      const movieId = existing?.id ?? (await this.repository.ensureMovie(tmdbId, details.title));
      const adapter = this.registry.get('tmdb');
      await this.repository.applyAdapterResult(
        movieId,
        'tmdb',
        adapter.sourceIds,
        TmdbAdapter.resultFromDetails(details),
        now,
      );
      await this.cache.invalidate(movieId);
      return this.cache.get(movieId);
    } catch (error) {
      this.logger.warn({ tmdbId, err: errorMessage(error) }, 'Fetching TMDB details failed');
      if (!existing) {
        throw new TRPCError({
          code: 'SERVICE_UNAVAILABLE',
          message: 'The movie catalog is temporarily unavailable. Try again shortly.',
        });
      }
      return null;
    }
  }

  private async searchTmdb(query: string, page: number, now: Date): Promise<CachedSearch> {
    const key = `search:tmdb:v1:${page}:${query.toLowerCase()}`;
    const cached = await this.redis.client.get(key).catch(() => null);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedSearch;
      const present = await this.cache.getMany(parsed.movieIds);
      if (present.size === parsed.movieIds.length) return parsed;
    }
    const response = await this.tmdb.searchMovies(query, page);
    const movieIds = await this.repository.upsertFromTmdbSummaries(response.results, now);
    await this.cache.invalidate(movieIds);
    const result: CachedSearch = { totalPages: Math.min(response.total_pages, 50), movieIds };
    await this.redis.client
      .set(key, JSON.stringify(result), 'EX', SEARCH_CACHE_SECONDS)
      .catch(() => undefined);
    return result;
  }

  private async prefetch(movies: readonly CachedMovie[], now: Date): Promise<void> {
    for (const movie of movies) {
      await this.ingestion
        .ensureRatings(movie, 'catalog', now)
        .catch((error) =>
          this.logger.debug(
            { movieId: movie.id, err: errorMessage(error) },
            'Prefetch enqueue failed',
          ),
        );
    }
  }
}
