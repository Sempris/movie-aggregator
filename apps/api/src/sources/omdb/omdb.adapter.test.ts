import { describe, expect, it } from 'vitest';
import { MemoryQuotaStore, mockFetch } from '../../../test/fetch-mock';
import { PermanentProviderError, QuotaExceededError } from '../../common/errors';
import type { MovieRef } from '../adapter.types';
import { DailyQuota } from '../quota';
import { OmdbAdapter, parseOmdbRatings } from './omdb.adapter';

const movie: MovieRef = {
  id: 'm1',
  tmdbId: 27205,
  imdbId: 'tt1375666',
  title: 'Inception',
  releaseYear: 2010,
};
const clock = () => new Date('2026-09-10T12:00:00Z');

function adapterWith(body: unknown, options: { status?: number; limit?: number } = {}) {
  const store = new MemoryQuotaStore();
  const quota = new DailyQuota(store, 'omdb', options.limit ?? 100, 0.5, clock);
  const fetchFn = mockFetch([
    { match: (url) => url.hostname === 'www.omdbapi.com', body, status: options.status },
  ]);
  return { adapter: new OmdbAdapter('key', quota, fetchFn), fetchFn, store, quota };
}

describe('parseOmdbRatings', () => {
  it('extracts IMDb, Rotten Tomatoes and Metacritic', () => {
    const ratings = parseOmdbRatings({
      Response: 'True',
      imdbRating: '8.8',
      imdbVotes: '2,612,345',
      Metascore: '74',
      Ratings: [
        { Source: 'Internet Movie Database', Value: '8.8/10' },
        { Source: 'Rotten Tomatoes', Value: '87%' },
        { Source: 'Metacritic', Value: '74/100' },
      ],
    });
    expect(ratings.imdb).toMatchObject({ rawValue: 8.8, normalizedValue: 88, voteCount: 2612345 });
    expect(ratings.rotten_tomatoes).toMatchObject({ rawValue: 87, normalizedValue: 87 });
    expect(ratings.metacritic).toMatchObject({ rawValue: 74, normalizedValue: 74 });
  });

  it('treats missing and N/A fields as absent', () => {
    const ratings = parseOmdbRatings({
      Response: 'True',
      imdbRating: 'N/A',
      Metascore: 'N/A',
      Ratings: [{ Source: 'Internet Movie Database', Value: '6.1/10' }],
    });
    expect(ratings.imdb?.rawValue).toBe(6.1);
    expect(ratings.rotten_tomatoes).toBeUndefined();
    expect(ratings.metacritic).toBeUndefined();
  });
});

describe('OmdbAdapter', () => {
  it('skips titles without an IMDb ID without spending quota', async () => {
    const { adapter, fetchFn, store } = adapterWith({});
    const result = await adapter.fetchRatings({ ...movie, imdbId: null }, { trigger: 'on_demand' });
    expect(result.status).toBe('skipped');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(store.values.size).toBe(0);
  });

  it('returns ratings and consumes one request of budget', async () => {
    const { adapter, store } = adapterWith({ Response: 'True', imdbRating: '8.8', Ratings: [] });
    const result = await adapter.fetchRatings(movie, { trigger: 'on_demand' });
    expect(result.status).toBe('ok');
    expect([...store.values.values()]).toEqual([1]);
  });

  it('maps "Movie not found!" to not_found', async () => {
    const { adapter } = adapterWith({ Response: 'False', Error: 'Movie not found!' });
    expect((await adapter.fetchRatings(movie, { trigger: 'on_demand' })).status).toBe('not_found');
  });

  it('keeps part of the budget for on-demand fetches', async () => {
    const { adapter } = adapterWith({ Response: 'True', imdbRating: '7.0' }, { limit: 2 });
    await adapter.fetchRatings(movie, { trigger: 'scheduled' });
    await expect(adapter.fetchRatings(movie, { trigger: 'scheduled' })).rejects.toMatchObject({
      scope: 'scheduled_share',
    });
    await expect(adapter.fetchRatings(movie, { trigger: 'on_demand' })).resolves.toMatchObject({
      status: 'ok',
    });
    await expect(adapter.fetchRatings(movie, { trigger: 'on_demand' })).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
  });

  it('syncs the counter when OMDb reports its limit is reached', async () => {
    const { adapter, quota } = adapterWith(
      { Response: 'False', Error: 'Request limit reached!' },
      { status: 401 },
    );
    await expect(adapter.fetchRatings(movie, { trigger: 'on_demand' })).rejects.toMatchObject({
      scope: 'daily_cap',
    });
    expect(await quota.remaining('on_demand')).toBe(0);
  });

  it('treats an invalid key as a permanent error', async () => {
    const { adapter } = adapterWith(
      { Response: 'False', Error: 'Invalid API key!' },
      { status: 401 },
    );
    await expect(adapter.fetchRatings(movie, { trigger: 'on_demand' })).rejects.toBeInstanceOf(
      PermanentProviderError,
    );
  });
});
