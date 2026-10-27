import { computed, ref } from 'vue';
import { describeError, trpc } from '@/lib/trpc';
import { useMovieCacheStore } from '@/stores/movieCache';

export function useMovieList(kind: 'trending' | 'popular') {
  const cache = useMovieCacheStore();
  const ids = ref<number[]>([]);
  const status = ref<'loading' | 'ready' | 'error'>('loading');
  const error = ref<string | null>(null);

  async function load() {
    status.value = 'loading';
    try {
      const list = await (kind === 'trending'
        ? trpc.movies.trending.query()
        : trpc.movies.popular.query());
      cache.upsert(list.movies);
      ids.value = list.movies.map((movie) => movie.tmdbId);
      status.value = 'ready';
    } catch (caught) {
      error.value = describeError(caught, 'This list could not be loaded.');
      status.value = 'error';
    }
  }

  void load();
  const movies = computed(() => ids.value.flatMap((id) => cache.get(id) ?? []));
  return { movies, status, error, reload: load };
}
