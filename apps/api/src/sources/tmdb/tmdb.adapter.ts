import type { AdapterResult, RatingSourceAdapter } from '../adapter.types';
import {
  type TmdbClient,
  type TmdbMovieDetails,
  metadataFromDetails,
  tmdbRating,
} from './tmdb.client';

/** TMDB is both the canonical catalog (metadata + imdb_id) and a community score. */
export class TmdbAdapter implements RatingSourceAdapter {
  readonly providerId = 'tmdb' as const;
  readonly sourceIds = ['tmdb'] as const;

  constructor(private readonly client: TmdbClient) {}

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  async fetchRatings(movie: { tmdbId: number }): Promise<AdapterResult> {
    const details = await this.client.getMovieDetails(movie.tmdbId);
    return details ? TmdbAdapter.resultFromDetails(details) : { status: 'not_found' };
  }

  static resultFromDetails(details: TmdbMovieDetails): AdapterResult {
    const rating = tmdbRating(details);
    return {
      status: 'ok',
      ratings: rating ? { tmdb: rating } : {},
      metadata: metadataFromDetails(details),
    };
  }
}
