import type { MovieSearchDto } from '@ratemix/shared';
import { watchDebounced } from '@vueuse/core';
import { type Ref, computed, ref } from 'vue';
import { describeError, trpc } from '@/lib/trpc';
import { useMovieCacheStore } from '@/stores/movieCache';

export function useMovieSearch(query: Ref<string>) {
  const cache = useMovieCacheStore();
  const result = ref<
    (Pick<MovieSearchDto, 'query' | 'origin' | 'totalPages'> & { ids: number[] }) | null
  >(null);
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const error = ref<string | null>(null);
  let latest = 0;

  watchDebounced(
    query,
    async (value) => {
      const trimmed = value.trim();
      const requestId = ++latest;
      if (trimmed.length < 2) {
        result.value = null;
        status.value = 'idle';
        return;
      }
      status.value = 'loading';
      try {
        const response = await trpc.movies.search.query({ query: trimmed });
        if (requestId !== latest) return;
        cache.upsert(response.results);
        result.value = { ...response, ids: response.results.map((movie) => movie.tmdbId) };
        status.value = 'ready';
      } catch (caught) {
        if (requestId !== latest) return;
        error.value = describeError(caught, 'Search is unavailable right now.');
        status.value = 'error';
      }
    },
    { debounce: 350, immediate: true },
  );

  const movies = computed(() => result.value?.ids.flatMap((id) => cache.get(id) ?? []) ?? []);
  return { result, movies, status, error };
}
