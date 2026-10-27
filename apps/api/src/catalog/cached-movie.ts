import type { ProviderId, ProviderSyncStatus, SourceId } from '@ratemix/shared';

/** Non-user-specific snapshot of a movie as stored in Redis. Dates are ISO strings. */
export interface CachedMovie {
  id: string;
  tmdbId: number;
  imdbId: string | null;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  runtimeMinutes: number | null;
  genres: string[];
  detailsFetchedAt: string | null;
  ratings: CachedRating[];
  syncs: CachedSync[];
}

export interface CachedRating {
  sourceId: SourceId;
  rawValue: number;
  normalizedValue: number;
  voteCount: number | null;
  fetchedAt: string;
}

export interface CachedSync {
  provider: ProviderId;
  status: ProviderSyncStatus;
  queuedAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}
