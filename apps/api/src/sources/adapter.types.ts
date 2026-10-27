import type { ProviderId, SourceId } from '@ratemix/shared';

/** What an adapter needs to know about a title to look it up. */
export interface MovieRef {
  id: string;
  tmdbId: number;
  imdbId: string | null;
  title: string;
  releaseYear: number | null;
}

/**
 * Why a fetch is happening. OMDb's daily budget is split between scheduled refreshes
 * and fetches a user is actively waiting for.
 */
export type JobTrigger = 'on_demand' | 'catalog' | 'scheduled';

export interface FetchContext {
  trigger: JobTrigger;
}

export interface NormalizedRating {
  rawValue: number;
  /** 0-100 */
  normalizedValue: number;
  voteCount?: number | null;
  /** Provider fragment kept for debugging and future re-normalization. */
  rawPayload?: Record<string, unknown>;
}

export interface MovieMetadataPatch {
  imdbId?: string | null;
  title?: string;
  originalTitle?: string | null;
  overview?: string | null;
  releaseDate?: Date | null;
  releaseYear?: number | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  runtimeMinutes?: number | null;
  genres?: string[];
  popularity?: number | null;
}

export type AdapterResult =
  | {
      status: 'ok';
      /** Sources this provider covers but omits here have no score for the title. */
      ratings: Partial<Record<SourceId, NormalizedRating>>;
      metadata?: MovieMetadataPatch;
    }
  | { status: 'not_found'; message?: string }
  | { status: 'skipped'; message: string };

/**
 * Every external rating API implements this. Adapters are pure with respect to
 * storage: they fetch, normalize and return; persistence happens elsewhere.
 *
 * Deviation from the plan's single-source interface: one adapter may return
 * several sources, because one OMDb call yields IMDb, Rotten Tomatoes and
 * Metacritic. Splitting it would triple usage of the tightest quota.
 */
export interface RatingSourceAdapter {
  readonly providerId: ProviderId;
  readonly sourceIds: readonly SourceId[];
  isConfigured(): boolean;
  fetchRatings(movie: MovieRef, context: FetchContext): Promise<AdapterResult>;
}
