import type { MovieDetailDto, RatingSourceDto, SourceRatingDto } from '@ratemix/shared';
import type { Page, Request } from '@playwright/test';

type Handler = (input: unknown) => unknown;

/**
 * Answers tRPC httpBatchLink requests: `/trpc/a,b?batch=1&input={"0":…,"1":…}` for queries,
 * a JSON body keyed by index for mutations. Records every procedure call for assertions.
 */
export async function mockTrpc(page: Page, handlers: Record<string, Handler>) {
  const calls: string[] = [];
  await page.route('**/trpc/**', async (route) => {
    const request: Request = route.request();
    const url = new URL(request.url());
    const paths = decodeURIComponent(url.pathname.replace(/^.*\/trpc\//, '')).split(',');
    const inputs: Record<string, unknown> =
      request.method() === 'GET'
        ? JSON.parse(url.searchParams.get('input') ?? '{}')
        : ((request.postDataJSON() as Record<string, unknown> | null) ?? {});

    const body = paths.map((path, index) => {
      calls.push(path);
      const handler = handlers[path];
      if (!handler) {
        return {
          error: {
            message: `No mock for ${path}`,
            code: -32004,
            data: { code: 'NOT_FOUND', httpStatus: 404, path },
          },
        };
      }
      return { result: { data: handler(inputs[String(index)]) } };
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return calls;
}

const rating = (
  sourceId: SourceRatingDto['sourceId'],
  normalizedValue: number,
  rawDisplay: string,
): SourceRatingDto => ({
  sourceId,
  normalizedValue,
  rawValue: normalizedValue,
  rawDisplay,
  voteCount: 1000,
  fetchedAt: new Date().toISOString(),
});

export const sources: RatingSourceDto[] = [
  {
    id: 'tmdb',
    displayName: 'TMDB',
    provider: 'tmdb',
    providerDisplayName: 'TMDB',
    deliveredVia: null,
    description: '',
    scaleMin: 0,
    scaleMax: 10,
    rawFormat: 'out_of_10',
    defaultWeight: 1,
    sortOrder: 10,
    available: true,
  },
  {
    id: 'imdb',
    displayName: 'IMDb',
    provider: 'omdb',
    providerDisplayName: 'OMDb',
    deliveredVia: 'OMDb',
    description: '',
    scaleMin: 0,
    scaleMax: 10,
    rawFormat: 'out_of_10',
    defaultWeight: 1,
    sortOrder: 20,
    available: true,
  },
  {
    id: 'rotten_tomatoes',
    displayName: 'Rotten Tomatoes',
    provider: 'omdb',
    providerDisplayName: 'OMDb',
    deliveredVia: 'OMDb',
    description: '',
    scaleMin: 0,
    scaleMax: 100,
    rawFormat: 'percent',
    defaultWeight: 1,
    sortOrder: 30,
    available: true,
  },
  {
    id: 'metacritic',
    displayName: 'Metacritic',
    provider: 'omdb',
    providerDisplayName: 'OMDb',
    deliveredVia: 'OMDb',
    description: '',
    scaleMin: 0,
    scaleMax: 100,
    rawFormat: 'out_of_100',
    defaultWeight: 1,
    sortOrder: 40,
    available: true,
  },
  {
    id: 'trakt',
    displayName: 'Trakt',
    provider: 'trakt',
    providerDisplayName: 'Trakt',
    deliveredVia: null,
    description: '',
    scaleMin: 0,
    scaleMax: 10,
    rawFormat: 'out_of_10',
    defaultWeight: 1,
    sortOrder: 50,
    available: true,
  },
];

/** Fictional fixture: equal weights give (72 + 81 + 94 + 68 + 75) / 5 = 78. */
export const fixtureMovie: MovieDetailDto = {
  id: '00000000-0000-4000-8000-000000001001',
  tmdbId: 1001,
  imdbId: 'tt9000001',
  title: 'Harbor Lights',
  originalTitle: 'Harbor Lights',
  releaseYear: 2026,
  releaseDate: '2026-08-01',
  posterUrl: null,
  backdropUrl: null,
  overview: 'A fixture film used by the end-to-end tests.',
  runtimeMinutes: 118,
  genres: ['Drama'],
  ratings: [
    rating('tmdb', 72, '7.2/10'),
    rating('imdb', 81, '8.1/10'),
    rating('rotten_tomatoes', 94, '94%'),
    rating('metacritic', 68, '68/100'),
    rating('trakt', 75, '7.5/10'),
  ],
  ratingsPending: false,
  providers: [
    {
      provider: 'tmdb',
      configured: true,
      status: 'ok',
      lastAttemptAt: null,
      lastSuccessAt: null,
      message: null,
    },
    {
      provider: 'omdb',
      configured: true,
      status: 'ok',
      lastAttemptAt: null,
      lastSuccessAt: null,
      message: null,
    },
    {
      provider: 'trakt',
      configured: true,
      status: 'ok',
      lastAttemptAt: null,
      lastSuccessAt: null,
      message: null,
    },
  ],
  compositeScore: {
    score: 78,
    basedOn: ['tmdb', 'imdb', 'rotten_tomatoes', 'metacritic', 'trakt'],
  },
  links: { tmdb: 'https://www.themoviedb.org/movie/1001', imdb: null },
};

export const defaultHandlers: Record<string, Handler> = {
  'sources.list': () => sources,
  'system.status': () => ({
    providers: { tmdb: true, omdb: true, trakt: true },
    oauthProviders: [],
    catalogSize: 1,
  }),
  'movies.getById': () => fixtureMovie,
  'movies.trending': () => ({ movies: [fixtureMovie], syncedAt: new Date().toISOString() }),
  'movies.popular': () => ({ movies: [], syncedAt: null }),
  'auth.refresh': () => null,
};
