import { normalizeScore, roundTo } from '@ratemix/shared';
import { PermanentProviderError, RateLimitedError, UpstreamError } from '../../common/errors';
import { type FetchFn, USER_AGENT, parseRetryAfterMs, requestJson } from '../../common/http';
import type { AdapterResult, MovieRef, RatingSourceAdapter } from '../adapter.types';

const API_BASE = 'https://api.trakt.tv';

interface TraktRatings {
  rating: number;
  votes: number;
}

interface TraktSearchResult {
  type: string;
  movie?: { ids?: { trakt?: number; slug?: string; imdb?: string | null } };
}

/** A second independent community score. Public endpoints only need a client ID. */
export class TraktAdapter implements RatingSourceAdapter {
  readonly providerId = 'trakt' as const;
  readonly sourceIds = ['trakt'] as const;

  constructor(
    private readonly clientId: string | undefined,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.clientId);
  }

  async fetchRatings(movie: MovieRef): Promise<AdapterResult> {
    // Trakt accepts IMDb IDs directly; otherwise resolve the TMDB ID to a Trakt ID first.
    const traktId = movie.imdbId ?? (await this.lookupByTmdbId(movie.tmdbId));
    if (!traktId) return { status: 'not_found', message: 'Trakt has no match for this TMDB ID' };

    const ratings = await this.get<TraktRatings>(`/movies/${encodeURIComponent(traktId)}/ratings`);
    if (!ratings) return { status: 'not_found' };
    if (!ratings.votes || typeof ratings.rating !== 'number' || ratings.rating <= 0) {
      return { status: 'ok', ratings: {} };
    }
    return {
      status: 'ok',
      ratings: {
        trakt: {
          rawValue: roundTo(ratings.rating, 2),
          normalizedValue: normalizeScore(ratings.rating, 0, 10),
          voteCount: ratings.votes,
          rawPayload: { rating: ratings.rating, votes: ratings.votes },
        },
      },
    };
  }

  private async lookupByTmdbId(tmdbId: number): Promise<string | null> {
    const results = await this.get<TraktSearchResult[]>(`/search/tmdb/${tmdbId}?type=movie`);
    const ids = results?.find((result) => result.type === 'movie')?.movie?.ids;
    if (!ids) return null;
    return ids.slug ?? (ids.trakt ? String(ids.trakt) : null);
  }

  private async get<T>(path: string): Promise<T | null> {
    if (!this.clientId)
      throw new PermanentProviderError('trakt', 'TRAKT_CLIENT_ID is not configured');
    const response = await requestJson<T>(
      'trakt',
      `${API_BASE}${path}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          'trakt-api-version': '2',
          'trakt-api-key': this.clientId,
        },
      },
      { fetchFn: this.fetchFn },
    );
    if (response.status === 404) return null;
    if (response.status === 429) {
      throw new RateLimitedError(
        'trakt',
        parseRetryAfterMs(response.headers.get('retry-after'), 30_000),
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new PermanentProviderError('trakt', 'client ID was rejected (check TRAKT_CLIENT_ID)');
    }
    if (response.status < 200 || response.status >= 300) {
      throw new UpstreamError(
        'trakt',
        response.status,
        `unexpected response (HTTP ${response.status})`,
      );
    }
    return response.body;
  }
}
