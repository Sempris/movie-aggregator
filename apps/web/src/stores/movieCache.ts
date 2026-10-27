import type { MovieDetailDto, MovieSummaryDto } from '@ratemix/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export type CachedMovie = MovieSummaryDto | MovieDetailDto;

export function isDetail(movie: CachedMovie | undefined): movie is MovieDetailDto {
  return Boolean(movie && 'providers' in movie);
}

/**
 * Per-movie normalized ratings already fetched from the API. Recomputing a composite
 * after a toggle is pure client-side math against this data: no request, no spinner.
 */
export const useMovieCacheStore = defineStore('movieCache', () => {
  const byTmdbId = ref<Record<number, CachedMovie>>({});

  function upsert(movies: readonly CachedMovie[]) {
    const next = { ...byTmdbId.value };
    for (const movie of movies) {
      const existing = next[movie.tmdbId];
      // A list response must not downgrade a detail record that's already loaded.
      next[movie.tmdbId] =
        isDetail(existing) && !isDetail(movie)
          ? { ...existing, ratings: movie.ratings, ratingsPending: movie.ratingsPending }
          : movie;
    }
    byTmdbId.value = next;
  }

  function get(tmdbId: number): CachedMovie | undefined {
    return byTmdbId.value[tmdbId];
  }

  return { byTmdbId, upsert, get };
});
