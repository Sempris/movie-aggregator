import { normalizeScore } from '@ratemix/shared';
import {
  PermanentProviderError,
  QuotaExceededError,
  RateLimitedError,
  UpstreamError,
} from '../../common/errors';
import { type FetchFn, USER_AGENT, requestJson } from '../../common/http';
import type {
  AdapterResult,
  FetchContext,
  MovieRef,
  NormalizedRating,
  RatingSourceAdapter,
} from '../adapter.types';
import type { DailyQuota } from '../quota';

export interface OmdbResponse {
  Response: 'True' | 'False';
  Error?: string;
  imdbID?: string;
  imdbRating?: string;
  imdbVotes?: string;
  Metascore?: string;
  Ratings?: Array<{ Source: string; Value: string }>;
}

type OmdbSourceId = 'imdb' | 'rotten_tomatoes' | 'metacritic';

function parseNumber(value: string | undefined | null): number | null {
  if (!value || value === 'N/A') return null;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parses "7.8/10", "91%", "74/100" into the leading number. */
function parseRatingValue(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(?:%|\/\s*\d+)?\s*$/.exec(value);
  return match?.[1] ? Number(match[1]) : null;
}

/**
 * Extracts whichever of IMDb / Rotten Tomatoes / Metacritic the record contains.
 * Missing entries are normal (coverage gaps are documented), not errors.
 */
export function parseOmdbRatings(
  body: OmdbResponse,
): Partial<Record<OmdbSourceId, NormalizedRating>> {
  const ratings: Partial<Record<OmdbSourceId, NormalizedRating>> = {};
  const entry = (source: string) => body.Ratings?.find((rating) => rating.Source === source);

  const imdbEntry = entry('Internet Movie Database');
  const imdb = parseNumber(body.imdbRating) ?? parseRatingValue(imdbEntry?.Value);
  if (imdb !== null && imdb > 0) {
    ratings.imdb = {
      rawValue: imdb,
      normalizedValue: normalizeScore(imdb, 0, 10),
      voteCount: parseNumber(body.imdbVotes),
      rawPayload: { imdbRating: body.imdbRating, imdbVotes: body.imdbVotes },
    };
  }

  const rtEntry = entry('Rotten Tomatoes');
  const tomatometer = parseRatingValue(rtEntry?.Value);
  if (tomatometer !== null) {
    ratings.rotten_tomatoes = {
      rawValue: tomatometer,
      normalizedValue: normalizeScore(tomatometer, 0, 100),
      voteCount: null,
      rawPayload: { ...rtEntry },
    };
  }

  const mcEntry = entry('Metacritic');
  const metascore = parseRatingValue(mcEntry?.Value) ?? parseNumber(body.Metascore);
  if (metascore !== null) {
    ratings.metacritic = {
      rawValue: metascore,
      normalizedValue: normalizeScore(metascore, 0, 100),
      voteCount: null,
      rawPayload: mcEntry ? { ...mcEntry } : { Metascore: body.Metascore },
    };
  }
  return ratings;
}

/**
 * OMDb bundles IMDb, Rotten Tomatoes and Metacritic numbers in one record. It's the
 * tightest quota in the system, so every call goes through the daily budget first.
 */
export class OmdbAdapter implements RatingSourceAdapter {
  readonly providerId = 'omdb' as const;
  readonly sourceIds = ['imdb', 'rotten_tomatoes', 'metacritic'] as const;

  constructor(
    private readonly apiKey: string | undefined,
    private readonly quota: DailyQuota,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async fetchRatings(movie: MovieRef, context: FetchContext): Promise<AdapterResult> {
    if (!this.apiKey) throw new PermanentProviderError('omdb', 'OMDB_API_KEY is not configured');
    if (!movie.imdbId) {
      // Don't spend quota on fuzzy title matching; wait for TMDB to supply the IMDb ID.
      return { status: 'skipped', message: 'No IMDb ID is known for this title' };
    }

    const decision = await this.quota.tryConsume(context.trigger);
    if (!decision.allowed) throw new QuotaExceededError('omdb', decision.scope, decision.resetAt);

    const url = new URL('https://www.omdbapi.com/');
    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('i', movie.imdbId);
    const response = await requestJson<OmdbResponse>(
      'omdb',
      url.toString(),
      { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } },
      { fetchFn: this.fetchFn },
    );

    const body = response.body;
    const error = body?.Response === 'False' ? (body.Error ?? 'Unknown error') : null;

    if (error && /limit reached/i.test(error)) {
      await this.quota.markExhausted();
      throw new QuotaExceededError('omdb', 'daily_cap', this.quota.resetAt());
    }
    if (error && /api key/i.test(error)) {
      throw new PermanentProviderError('omdb', `${error} (check OMDB_API_KEY)`);
    }
    if (response.status === 429) throw new RateLimitedError('omdb', 60_000);
    if (response.status >= 500 || !body) {
      throw new UpstreamError(
        'omdb',
        response.status,
        `unexpected response (HTTP ${response.status})`,
      );
    }
    if (error) {
      if (/not found|incorrect imdb id/i.test(error))
        return { status: 'not_found', message: error };
      throw new UpstreamError('omdb', response.status, error);
    }
    return { status: 'ok', ratings: parseOmdbRatings(body) };
  }
}
