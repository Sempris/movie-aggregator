import { describe, expect, it } from 'vitest';
import type { CachedMovie } from './cached-movie';
import {
  planFetchOrder,
  providersNeedingFetch,
  refreshTier,
  selectDueForRefresh,
} from './refresh-policy';

const now = new Date('2026-09-10T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
const intervals = { hotHours: 6, recentHours: 12, stableHours: 24 };

describe('refresh tiers', () => {
  it('classifies titles by list membership and release age', () => {
    expect(refreshTier({ listed: true, releaseDate: new Date('1990-01-01') }, now)).toBe('hot');
    expect(refreshTier({ listed: false, releaseDate: new Date('2026-08-20') }, now)).toBe('hot');
    expect(refreshTier({ listed: false, releaseDate: new Date('2026-01-01') }, now)).toBe('recent');
    expect(refreshTier({ listed: false, releaseDate: new Date('2001-01-01') }, now)).toBe('stable');
    expect(refreshTier({ listed: false, releaseDate: null }, now)).toBe('stable');
  });

  it('selects only candidates whose tier interval has elapsed', () => {
    const due = selectDueForRefresh(
      [
        { id: 'never', listed: false, releaseDate: null, lastAttemptAt: null },
        { id: 'hot-due', listed: true, releaseDate: null, lastAttemptAt: hoursAgo(7) },
        {
          id: 'stable-not-due',
          listed: false,
          releaseDate: new Date('2000-01-01'),
          lastAttemptAt: hoursAgo(7),
        },
        {
          id: 'stable-due',
          listed: false,
          releaseDate: new Date('2000-01-01'),
          lastAttemptAt: hoursAgo(25),
        },
      ],
      intervals,
      now,
    );
    expect(due.map((c) => c.id)).toEqual(['never', 'hot-due', 'stable-due']);
  });
});

describe('on-demand fetch decisions', () => {
  const base: Pick<CachedMovie, 'imdbId' | 'detailsFetchedAt' | 'syncs'> = {
    imdbId: null,
    detailsFetchedAt: null,
    syncs: [],
  };

  it('requests every configured provider for a brand-new title, TMDB first', () => {
    const needed = providersNeedingFetch(base, ['tmdb', 'omdb', 'trakt'], now);
    expect(needed).toEqual(['tmdb', 'omdb', 'trakt']);
    expect(planFetchOrder(needed, null)).toEqual({
      immediate: ['tmdb'],
      followUps: ['omdb', 'trakt'],
    });
    expect(planFetchOrder(['omdb', 'trakt'], 'tt1')).toEqual({
      immediate: ['omdb', 'trakt'],
      followUps: [],
    });
  });

  it('leaves fresh, queued and fetched providers alone', () => {
    const movie = {
      imdbId: 'tt1',
      detailsFetchedAt: hoursAgo(1).toISOString(),
      syncs: [
        {
          provider: 'tmdb' as const,
          status: 'ok' as const,
          queuedAt: null,
          lastAttemptAt: hoursAgo(1).toISOString(),
          lastSuccessAt: null,
          lastError: null,
        },
        {
          provider: 'omdb' as const,
          status: 'queued' as const,
          queuedAt: new Date(now.getTime() - 60_000).toISOString(),
          lastAttemptAt: null,
          lastSuccessAt: null,
          lastError: null,
        },
        {
          provider: 'trakt' as const,
          status: 'not_found' as const,
          queuedAt: null,
          lastAttemptAt: hoursAgo(1).toISOString(),
          lastSuccessAt: null,
          lastError: null,
        },
      ],
    };
    expect(providersNeedingFetch(movie, ['tmdb', 'omdb', 'trakt'], now)).toEqual([]);
  });

  it('retries lost jobs, old errors, and skips that TMDB has since unblocked', () => {
    const movie = {
      imdbId: 'tt1',
      detailsFetchedAt: hoursAgo(0.1).toISOString(),
      syncs: [
        {
          provider: 'tmdb' as const,
          status: 'queued' as const,
          queuedAt: hoursAgo(1).toISOString(),
          lastAttemptAt: null,
          lastSuccessAt: null,
          lastError: null,
        },
        {
          provider: 'omdb' as const,
          status: 'skipped' as const,
          queuedAt: null,
          lastAttemptAt: hoursAgo(0.2).toISOString(),
          lastSuccessAt: null,
          lastError: 'No IMDb ID',
        },
        {
          provider: 'trakt' as const,
          status: 'error' as const,
          queuedAt: null,
          lastAttemptAt: hoursAgo(1).toISOString(),
          lastSuccessAt: null,
          lastError: 'boom',
        },
      ],
    };
    expect(providersNeedingFetch(movie, ['tmdb', 'omdb', 'trakt'], now)).toEqual([
      'tmdb',
      'omdb',
      'trakt',
    ]);
  });
});
