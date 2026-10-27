import type { ProviderId } from '@ratemix/shared';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../common/time';
import type { CachedMovie } from './cached-movie';
import type { RefreshCandidate } from './ratings.repository';

export type RefreshTier = 'hot' | 'recent' | 'stable';

export interface RefreshIntervals {
  hotHours: number;
  recentHours: number;
  stableHours: number;
}

/** A queued job that hasn't finished in this long is assumed lost and may be re-enqueued. */
export const STALE_QUEUED_MS = 15 * MINUTE_MS;
const ERROR_RETRY_MS = 30 * MINUTE_MS;
const SKIPPED_RETRY_MS = HOUR_MS;

/** Trending/popular titles and recent releases change fastest, so they refresh most often. */
export function refreshTier(
  candidate: Pick<RefreshCandidate, 'releaseDate' | 'listed'>,
  now: Date,
): RefreshTier {
  if (candidate.listed) return 'hot';
  if (!candidate.releaseDate) return 'stable';
  const age = now.getTime() - candidate.releaseDate.getTime();
  if (age < 60 * DAY_MS) return 'hot';
  if (age < 365 * DAY_MS) return 'recent';
  return 'stable';
}

export function intervalMs(tier: RefreshTier, intervals: RefreshIntervals): number {
  const hours =
    tier === 'hot'
      ? intervals.hotHours
      : tier === 'recent'
        ? intervals.recentHours
        : intervals.stableHours;
  return hours * HOUR_MS;
}

/** Keeps candidates whose tier interval has elapsed, preserving the oldest-first order. */
export function selectDueForRefresh(
  candidates: readonly RefreshCandidate[],
  intervals: RefreshIntervals,
  now: Date,
): RefreshCandidate[] {
  return candidates.filter((candidate) => {
    if (!candidate.lastAttemptAt) return true;
    const elapsed = now.getTime() - candidate.lastAttemptAt.getTime();
    return elapsed >= intervalMs(refreshTier(candidate, now), intervals);
  });
}

type SyncView = Pick<CachedMovie, 'imdbId' | 'detailsFetchedAt' | 'syncs'>;

/**
 * Decides which providers a title needs on demand (someone is looking at it).
 * Freshness of already-fetched data is the scheduler's job, not this function's.
 */
export function providersNeedingFetch(
  movie: SyncView,
  configured: readonly ProviderId[],
  now: Date,
): ProviderId[] {
  const olderThan = (iso: string | null, ms: number) =>
    !iso || now.getTime() - Date.parse(iso) >= ms;

  return configured.filter((provider) => {
    const sync = movie.syncs.find((entry) => entry.provider === provider);
    if (!sync) return true;
    switch (sync.status) {
      case 'queued':
        return olderThan(sync.queuedAt, STALE_QUEUED_MS);
      case 'error':
        return olderThan(sync.lastAttemptAt, ERROR_RETRY_MS);
      case 'skipped': {
        // Typically "no IMDb ID yet": retry as soon as TMDB has supplied one.
        const unblocked =
          provider !== 'tmdb' &&
          movie.imdbId !== null &&
          movie.detailsFetchedAt !== null &&
          (!sync.lastAttemptAt ||
            Date.parse(sync.lastAttemptAt) < Date.parse(movie.detailsFetchedAt));
        return unblocked || olderThan(sync.lastAttemptAt, SKIPPED_RETRY_MS);
      }
      case 'deferred':
      case 'ok':
      case 'not_found':
        return provider === 'tmdb' && movie.detailsFetchedAt === null && sync.status !== 'deferred';
    }
  });
}

/**
 * OMDb and Trakt resolve titles by IMDb ID, which only TMDB details provide. When
 * TMDB still has to run and the ID is unknown, the others wait as follow-ups.
 */
export function planFetchOrder(
  needed: readonly ProviderId[],
  imdbId: string | null,
): { immediate: ProviderId[]; followUps: ProviderId[] } {
  if (needed.includes('tmdb') && !imdbId) {
    return { immediate: ['tmdb'], followUps: needed.filter((provider) => provider !== 'tmdb') };
  }
  return { immediate: [...needed], followUps: [] };
}
