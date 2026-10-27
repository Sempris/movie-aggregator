import { normalizeScore, roundTo } from '@ratemix/shared';
import { PermanentProviderError, RateLimitedError, UpstreamError } from '../../common/errors';
import { type FetchFn, USER_AGENT, parseRetryAfterMs, requestJson } from '../../common/http';
import type { MovieMetadataPatch, NormalizedRating } from '../adapter.types';

const API_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

export interface TmdbMovieSummary {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  release_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  adult?: boolean;
}

export interface TmdbMovieDetails extends TmdbMovieSummary {
  imdb_id?: string | null;
  runtime?: number | null;
  genres?: Array<{ id: number; name: string }>;
  external_ids?: { imdb_id?: string | null };
}

export interface TmdbPage<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export type TmdbImageSize = 'w185' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original';

export function tmdbImageUrl(path: string | null | undefined, size: TmdbImageSize): string | null {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

function parseReleaseDate(value: string | undefined): { date: Date | null; year: number | null } {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: null, year: null };
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? { date: null, year: null }
    : { date, year: date.getUTCFullYear() };
}

function normalizeImdbId(value: string | null | undefined): string | null {
  return value && /^tt\d{5,}$/.test(value) ? value : null;
}

/** Fields present in list/search payloads. Never overwrites detail-only fields. */
export function metadataFromSummary(movie: TmdbMovieSummary): MovieMetadataPatch {
  const release = parseReleaseDate(movie.release_date);
  return {
    title: movie.title,
    originalTitle: movie.original_title ?? null,
    overview: movie.overview || null,
    releaseDate: release.date,
    releaseYear: release.year,
    posterPath: movie.poster_path ?? null,
    backdropPath: movie.backdrop_path ?? null,
    popularity: movie.popularity ?? null,
  };
}

export function metadataFromDetails(movie: TmdbMovieDetails): MovieMetadataPatch {
  return {
    ...metadataFromSummary(movie),
    imdbId: normalizeImdbId(movie.imdb_id ?? movie.external_ids?.imdb_id),
    runtimeMinutes: movie.runtime && movie.runtime > 0 ? movie.runtime : null,
    genres: (movie.genres ?? []).map((genre) => genre.name),
  };
}

/** TMDB reports vote_average 0 for titles nobody has rated yet; treat that as "no score". */
export function tmdbRating(movie: TmdbMovieSummary): NormalizedRating | null {
  if (!movie.vote_count || movie.vote_count <= 0 || typeof movie.vote_average !== 'number') {
    return null;
  }
  return {
    rawValue: roundTo(movie.vote_average, 2),
    normalizedValue: normalizeScore(movie.vote_average, 0, 10),
    voteCount: movie.vote_count,
    rawPayload: { vote_average: movie.vote_average, vote_count: movie.vote_count },
  };
}

/**
 * Thin TMDB v3 client. Accepts either a v3 API key (sent as a query parameter) or a
 * v4 read access token (a JWT, sent as a Bearer header).
 */
export class TmdbClient {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async searchMovies(query: string, page = 1): Promise<TmdbPage<TmdbMovieSummary>> {
    const body = await this.get<TmdbPage<TmdbMovieSummary>>('/search/movie', {
      query,
      page: String(page),
      include_adult: 'false',
      language: 'en-US',
    });
    return body ?? { page, results: [], total_pages: 0, total_results: 0 };
  }

  /** Returns null when TMDB doesn't know the ID. */
  async getMovieDetails(tmdbId: number): Promise<TmdbMovieDetails | null> {
    return this.get<TmdbMovieDetails>(`/movie/${tmdbId}`, {
      append_to_response: 'external_ids',
      language: 'en-US',
    });
  }

  async trending(window: 'day' | 'week' = 'day'): Promise<TmdbMovieSummary[]> {
    const body = await this.get<TmdbPage<TmdbMovieSummary>>(`/trending/movie/${window}`, {
      language: 'en-US',
    });
    return body?.results ?? [];
  }

  async popular(page = 1): Promise<TmdbMovieSummary[]> {
    const body = await this.get<TmdbPage<TmdbMovieSummary>>('/movie/popular', {
      page: String(page),
      language: 'en-US',
    });
    return body?.results ?? [];
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T | null> {
    if (!this.apiKey) {
      throw new PermanentProviderError('tmdb', 'TMDB_API_KEY is not configured');
    }
    const url = new URL(`${API_BASE}${path}`);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    };
    if (this.apiKey.startsWith('eyJ')) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    } else {
      url.searchParams.set('api_key', this.apiKey);
    }
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const response = await requestJson<T>(
      'tmdb',
      url.toString(),
      { headers },
      { fetchFn: this.fetchFn },
    );
    if (response.status === 404) return null;
    if (response.status === 429) {
      throw new RateLimitedError(
        'tmdb',
        parseRetryAfterMs(response.headers.get('retry-after'), 10_000),
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new PermanentProviderError('tmdb', 'API key was rejected (check TMDB_API_KEY)');
    }
    if (response.status < 200 || response.status >= 300 || response.body === null) {
      throw new UpstreamError(
        'tmdb',
        response.status,
        `unexpected response (HTTP ${response.status})`,
      );
    }
    return response.body;
  }
}
