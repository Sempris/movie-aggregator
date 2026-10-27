import {
  type MovieDetailDto,
  type MovieSummaryDto,
  PROVIDERS,
  PROVIDER_IDS,
  type PreferenceMap,
  type ProviderId,
  type ProviderStateDto,
  type SourceDefinition,
  computeCompositeScore,
  formatRawScore,
} from '@ratemix/shared';
import type { CachedMovie, CachedSync } from '../catalog/cached-movie';
import { STALE_QUEUED_MS } from '../catalog/refresh-policy';
import { tmdbImageUrl } from '../sources/tmdb/tmdb.client';

export function isRatingsPending(syncs: readonly CachedSync[], now: Date): boolean {
  return syncs.some(
    (sync) =>
      sync.status === 'queued' &&
      sync.queuedAt !== null &&
      now.getTime() - Date.parse(sync.queuedAt) < STALE_QUEUED_MS,
  );
}

export function toSummaryDto(
  movie: CachedMovie,
  sources: readonly SourceDefinition[],
  now: Date,
): MovieSummaryDto {
  const formats = new Map(sources.map((source) => [source.id, source.rawFormat]));
  return {
    id: movie.id,
    tmdbId: movie.tmdbId,
    imdbId: movie.imdbId,
    title: movie.title,
    releaseYear: movie.releaseYear,
    posterUrl: tmdbImageUrl(movie.posterPath, 'w342'),
    ratings: movie.ratings.flatMap((rating) => {
      const format = formats.get(rating.sourceId);
      return format ? [{ ...rating, rawDisplay: formatRawScore(rating.rawValue, format) }] : [];
    }),
    ratingsPending: isRatingsPending(movie.syncs, now),
  };
}

function providerMessage(
  provider: ProviderId,
  configured: boolean,
  sync: CachedSync | undefined,
): string | null {
  if (!configured) return 'Not configured on this server';
  switch (sync?.status) {
    case 'not_found':
      return `No match on ${PROVIDERS[provider].displayName}`;
    case 'skipped':
    case 'deferred':
      return sync.lastError;
    case 'error':
      return 'Temporarily unavailable; will retry';
    default:
      return null;
  }
}

export function toDetailDto(
  movie: CachedMovie,
  sources: readonly SourceDefinition[],
  configured: Record<ProviderId, boolean>,
  preferences: PreferenceMap,
  now: Date,
): MovieDetailDto {
  const summary = toSummaryDto(movie, sources, now);
  const providers: ProviderStateDto[] = PROVIDER_IDS.map((provider) => {
    const sync = movie.syncs.find((entry) => entry.provider === provider);
    return {
      provider,
      configured: configured[provider],
      status: sync?.status ?? null,
      lastAttemptAt: sync?.lastAttemptAt ?? null,
      lastSuccessAt: sync?.lastSuccessAt ?? null,
      message: providerMessage(provider, configured[provider], sync),
    };
  });
  const composite = computeCompositeScore(summary.ratings, preferences);

  return {
    ...summary,
    originalTitle: movie.originalTitle,
    overview: movie.overview,
    backdropUrl: tmdbImageUrl(movie.backdropPath, 'w1280'),
    releaseDate: movie.releaseDate,
    runtimeMinutes: movie.runtimeMinutes,
    genres: movie.genres,
    providers,
    compositeScore: {
      score: composite.score,
      basedOn: composite.contributions.map((contribution) => contribution.sourceId),
    },
    links: {
      tmdb: `https://www.themoviedb.org/movie/${movie.tmdbId}`,
      imdb: movie.imdbId ? `https://www.imdb.com/title/${movie.imdbId}/` : null,
    },
  };
}
