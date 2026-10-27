import { describe, expect, it } from 'vitest';
import { mockFetch } from '../../../test/fetch-mock';
import { RateLimitedError } from '../../common/errors';
import { TraktAdapter } from './trakt.adapter';

const movie = {
  id: 'm1',
  tmdbId: 603,
  imdbId: 'tt0133093',
  title: 'The Matrix',
  releaseYear: 1999,
};

describe('TraktAdapter', () => {
  it('fetches ratings by IMDb ID with the required headers', async () => {
    const fetchFn = mockFetch([
      {
        match: (url, init) =>
          url.pathname === '/movies/tt0133093/ratings' &&
          (init?.headers as Record<string, string>)['trakt-api-key'] === 'client' &&
          (init?.headers as Record<string, string>)['trakt-api-version'] === '2',
        body: { rating: 8.4567, votes: 51234, distribution: {} },
      },
    ]);
    const result = await new TraktAdapter('client', fetchFn).fetchRatings(movie);
    expect(result).toEqual({
      status: 'ok',
      ratings: {
        trakt: {
          rawValue: 8.46,
          normalizedValue: 84.57,
          voteCount: 51234,
          rawPayload: { rating: 8.4567, votes: 51234 },
        },
      },
    });
  });

  it('resolves a Trakt ID from the TMDB ID when no IMDb ID is known', async () => {
    const fetchFn = mockFetch([
      {
        match: (url) => url.pathname === '/search/tmdb/603',
        body: [{ type: 'movie', movie: { ids: { trakt: 481, slug: 'the-matrix-1999' } } }],
      },
      {
        match: (url) => url.pathname === '/movies/the-matrix-1999/ratings',
        body: { rating: 8, votes: 10 },
      },
    ]);
    const result = await new TraktAdapter('client', fetchFn).fetchRatings({
      ...movie,
      imdbId: null,
    });
    expect(result.status).toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('returns an empty ok result when nobody has rated the title', async () => {
    const fetchFn = mockFetch([{ match: () => true, body: { rating: 0, votes: 0 } }]);
    expect(await new TraktAdapter('client', fetchFn).fetchRatings(movie)).toEqual({
      status: 'ok',
      ratings: {},
    });
  });

  it('surfaces 429 as a rate limit with the Retry-After delay', async () => {
    const fetchFn = mockFetch([
      { match: () => true, status: 429, headers: { 'retry-after': '12' } },
    ]);
    const error = await new TraktAdapter('client', fetchFn)
      .fetchRatings(movie)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).retryAfterMs).toBe(12_000);
  });
});
