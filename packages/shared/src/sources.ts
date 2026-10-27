/**
 * Catalog of rating sources RateMix knows how to ingest.
 *
 * A *provider* is the API we call (one adapter per provider). A *source* is a
 * distinct opinion a user can toggle. One provider can deliver several sources:
 * a single OMDb call returns IMDb, Rotten Tomatoes and Metacritic scores.
 */

export const PROVIDER_IDS = ['tmdb', 'omdb', 'trakt'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const SOURCE_IDS = ['tmdb', 'imdb', 'rotten_tomatoes', 'metacritic', 'trakt'] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

/** How a source's native number is written, e.g. "7.8/10", "91%", "74/100". */
export type RawScoreFormat = 'out_of_10' | 'percent' | 'out_of_100';

export interface ProviderDefinition {
  id: ProviderId;
  displayName: string;
  homepage: string;
}

export interface SourceDefinition {
  id: SourceId;
  displayName: string;
  provider: ProviderId;
  description: string;
  scaleMin: number;
  scaleMax: number;
  rawFormat: RawScoreFormat;
  defaultWeight: number;
  sortOrder: number;
}

export const PROVIDERS: Readonly<Record<ProviderId, ProviderDefinition>> = {
  tmdb: { id: 'tmdb', displayName: 'TMDB', homepage: 'https://www.themoviedb.org' },
  omdb: { id: 'omdb', displayName: 'OMDb', homepage: 'https://www.omdbapi.com' },
  trakt: { id: 'trakt', displayName: 'Trakt', homepage: 'https://trakt.tv' },
};

export const SOURCE_CATALOG: readonly SourceDefinition[] = [
  {
    id: 'tmdb',
    displayName: 'TMDB',
    provider: 'tmdb',
    description: 'Average score from members of The Movie Database.',
    scaleMin: 0,
    scaleMax: 10,
    rawFormat: 'out_of_10',
    defaultWeight: 1,
    sortOrder: 10,
  },
  {
    id: 'imdb',
    displayName: 'IMDb',
    provider: 'omdb',
    description: 'Weighted average of IMDb user votes.',
    scaleMin: 0,
    scaleMax: 10,
    rawFormat: 'out_of_10',
    defaultWeight: 1,
    sortOrder: 20,
  },
  {
    id: 'rotten_tomatoes',
    displayName: 'Rotten Tomatoes',
    provider: 'omdb',
    description: 'Tomatometer: the share of approved critics who reviewed the film positively.',
    scaleMin: 0,
    scaleMax: 100,
    rawFormat: 'percent',
    defaultWeight: 1,
    sortOrder: 30,
  },
  {
    id: 'metacritic',
    displayName: 'Metacritic',
    provider: 'omdb',
    description: 'Metascore: a weighted average of published critic reviews.',
    scaleMin: 0,
    scaleMax: 100,
    rawFormat: 'out_of_100',
    defaultWeight: 1,
    sortOrder: 40,
  },
  {
    id: 'trakt',
    displayName: 'Trakt',
    provider: 'trakt',
    description: 'Average rating from Trakt members.',
    scaleMin: 0,
    scaleMax: 10,
    rawFormat: 'out_of_10',
    defaultWeight: 1,
    sortOrder: 50,
  },
];

const SOURCE_ID_SET: ReadonlySet<string> = new Set(SOURCE_IDS);
const PROVIDER_ID_SET: ReadonlySet<string> = new Set(PROVIDER_IDS);

export function isSourceId(value: string): value is SourceId {
  return SOURCE_ID_SET.has(value);
}

export function isProviderId(value: string): value is ProviderId {
  return PROVIDER_ID_SET.has(value);
}

export function getSourceDefinition(id: SourceId): SourceDefinition {
  const definition = SOURCE_CATALOG.find((source) => source.id === id);
  if (!definition) {
    throw new Error(`Unknown rating source: ${id}`);
  }
  return definition;
}

export function sourcesForProvider(provider: ProviderId): SourceDefinition[] {
  return SOURCE_CATALOG.filter((source) => source.provider === provider);
}

/**
 * Name of the service that actually delivers a source's number when it isn't the
 * source itself (e.g. Rotten Tomatoes scores arrive via OMDb). Null when direct.
 */
export function deliveredVia(source: Pick<SourceDefinition, 'id' | 'provider'>): string | null {
  return source.provider === source.id ? null : PROVIDERS[source.provider].displayName;
}
