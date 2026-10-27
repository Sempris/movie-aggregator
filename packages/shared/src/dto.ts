import type { RawScoreFormat, ProviderId, SourceId } from './sources';

/** Outcome of the most recent ingestion attempt for one provider and title. */
export type ProviderSyncStatus = 'queued' | 'ok' | 'not_found' | 'skipped' | 'deferred' | 'error';

export type AuthProviderId = 'password' | 'github' | 'google';
export type OAuthProviderId = Exclude<AuthProviderId, 'password'>;

export interface SourceRatingDto {
  sourceId: SourceId;
  rawValue: number;
  rawDisplay: string;
  normalizedValue: number;
  voteCount: number | null;
  fetchedAt: string;
}

export interface ProviderStateDto {
  provider: ProviderId;
  configured: boolean;
  status: ProviderSyncStatus | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  message: string | null;
}

export interface MovieSummaryDto {
  id: string;
  tmdbId: number;
  imdbId: string | null;
  title: string;
  releaseYear: number | null;
  posterUrl: string | null;
  ratings: SourceRatingDto[];
  /** True while at least one provider has a fetch queued for this title. */
  ratingsPending: boolean;
}

export interface MovieDetailDto extends MovieSummaryDto {
  originalTitle: string | null;
  overview: string | null;
  backdropUrl: string | null;
  releaseDate: string | null;
  runtimeMinutes: number | null;
  genres: string[];
  providers: ProviderStateDto[];
  /** Composite for the requesting user (server-side preferences, or defaults for guests). */
  compositeScore: { score: number | null; basedOn: SourceId[] };
  links: { tmdb: string; imdb: string | null };
}

export interface MovieListDto {
  movies: MovieSummaryDto[];
  syncedAt: string | null;
}

export interface MovieSearchDto {
  query: string;
  results: MovieSummaryDto[];
  page: number;
  totalPages: number;
  /** 'tmdb' for live catalog search, 'local' when falling back to already-ingested titles. */
  origin: 'tmdb' | 'local';
}

export interface RatingSourceDto {
  id: SourceId;
  displayName: string;
  provider: ProviderId;
  providerDisplayName: string;
  /** Provider name when the number is second-hand (e.g. "OMDb"), otherwise null. */
  deliveredVia: string | null;
  description: string;
  scaleMin: number;
  scaleMax: number;
  rawFormat: RawScoreFormat;
  defaultWeight: number;
  sortOrder: number;
  /** False when the server has no API key for this source's provider. */
  available: boolean;
}

export interface SourcePreferenceDto {
  sourceId: SourceId;
  enabled: boolean;
  weight: number;
}

export interface PreferencesDto {
  preferences: SourcePreferenceDto[];
  /** False when the account has never saved preferences (defaults are in effect). */
  customized: boolean;
  updatedAt: string | null;
}

export interface UserDto {
  id: string;
  email: string | null;
  displayName: string | null;
  authProvider: AuthProviderId;
}

export interface AuthSessionDto {
  user: UserDto;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface SystemStatusDto {
  providers: Record<ProviderId, boolean>;
  oauthProviders: OAuthProviderId[];
  catalogSize: number;
}
