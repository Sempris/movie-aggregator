import { describe, expect, it } from 'vitest';
import { mockFetch } from '../../../test/fetch-mock';
import { PermanentProviderError } from '../../common/errors';
import { TmdbAdapter } from './tmdb.adapter';
import { TmdbClient, metadataFromDetails, tmdbImageUrl, tmdbRating } from './tmdb.client';

describe('TmdbClient', () => {
  it('sends v3 keys as a query parameter', async () => {
    const fetchFn = mockFetch([
      {
        match: (url) => url.searchParams.get('api_key') === 'v3key',
        body: { page: 1, results: [], total_pages: 0, total_results: 0 },
      },
    ]);
    await new TmdbClient('v3key', fetchFn).searchMovies('heat');
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('sends v4 read access tokens as a Bearer header', async () => {
    const fetchFn = mockFetch([
      {
        match: (url, init) =>
          !url.searchParams.has('api_key') &&
          (init?.headers as Record<string, string>).Authorization === 'Bearer eyJhbGciOi.token',
        body: { id: 1, title: 'x' },
      },
    ]);
    await new TmdbClient('eyJhbGciOi.token', fetchFn).getMovieDetails(1);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('returns null for unknown titles and rejects bad keys permanently', async () => {
    const notFound = mockFetch([
      { match: () => true, status: 404, body: { status_message: 'not found' } },
    ]);
    expect(await new TmdbClient('k', notFound).getMovieDetails(999)).toBeNull();
    const unauthorized = mockFetch([{ match: () => true, status: 401, body: {} }]);
    await expect(new TmdbClient('k', unauthorized).getMovieDetails(1)).rejects.toBeInstanceOf(
      PermanentProviderError,
    );
  });
});

describe('TMDB mapping', () => {
  const details = {
    id: 949,
    title: 'Heat',
    original_title: 'Heat',
    overview: 'A group of professional bank robbers…',
    release_date: '1995-12-15',
    poster_path: '/poster.jpg',
    backdrop_path: null,
    popularity: 42.5,
    vote_average: 7.9,
    vote_count: 7000,
    runtime: 170,
    genres: [{ id: 1, name: 'Crime' }],
    external_ids: { imdb_id: 'tt0113277' },
  };

  it('maps details into metadata, including the IMDb ID', () => {
    expect(metadataFromDetails(details)).toMatchObject({
      imdbId: 'tt0113277',
      releaseYear: 1995,
      runtimeMinutes: 170,
      genres: ['Crime'],
    });
    expect(metadataFromDetails({ ...details, release_date: '' }).releaseDate).toBeNull();
  });

  it('ignores unrated titles and normalizes the community score', () => {
    expect(tmdbRating({ ...details, vote_count: 0, vote_average: 0 })).toBeNull();
    expect(tmdbRating(details)).toMatchObject({
      rawValue: 7.9,
      normalizedValue: 79,
      voteCount: 7000,
    });
    expect(TmdbAdapter.resultFromDetails(details)).toMatchObject({
      status: 'ok',
      ratings: { tmdb: { normalizedValue: 79 } },
    });
  });

  it('builds image URLs', () => {
    expect(tmdbImageUrl('/a.jpg', 'w342')).toBe('https://image.tmdb.org/t/p/w342/a.jpg');
    expect(tmdbImageUrl(null, 'w342')).toBeNull();
  });
});
