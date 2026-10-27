import { type MaybeRefOrGetter, computed, onScopeDispose, ref, toValue, watch } from 'vue';
import { describeError, isTrpcError, trpc } from '@/lib/trpc';
import { isDetail, useMovieCacheStore } from '@/stores/movieCache';

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 24;

/**
 * Loads a title and keeps polling while providers are still fetching its ratings
 * (the API enqueues those fetches; it never waits on them).
 */
export function useMovieDetail(tmdbId: MaybeRefOrGetter<number>) {
  const cache = useMovieCacheStore();
  const status = ref<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let polls = 0;

  const cached = computed(() => cache.get(toValue(tmdbId)));
  const movie = computed(() => (isDetail(cached.value) ? cached.value : null));

  async function load(silent = false) {
    clearTimeout(timer);
    const id = toValue(tmdbId);
    if (!silent && !movie.value) status.value = 'loading';
    try {
      const detail = await trpc.movies.getById.query({ tmdbId: id });
      if (id !== toValue(tmdbId)) return;
      cache.upsert([detail]);
      status.value = 'ready';
      error.value = null;
      if (detail.ratingsPending && polls < MAX_POLLS) {
        polls += 1;
        timer = setTimeout(() => void load(true), POLL_INTERVAL_MS);
      }
    } catch (caught) {
      if (id !== toValue(tmdbId)) return;
      if (isTrpcError(caught) && caught.data?.code === 'NOT_FOUND') {
        status.value = 'not_found';
        return;
      }
      error.value = describeError(caught, 'This title could not be loaded.');
      if (!movie.value) status.value = 'error';
    }
  }

  watch(
    () => toValue(tmdbId),
    () => {
      polls = 0;
      void load();
    },
    { immediate: true },
  );
  onScopeDispose(() => clearTimeout(timer));

  return {
    movie,
    /** Summary from a list or search, shown while the detail request is in flight. */
    preview: cached,
    status,
    error,
    reload: () => {
      polls = 0;
      return load();
    },
  };
}
