import {
  PROVIDERS,
  type RatingSourceDto,
  SOURCE_CATALOG,
  type SourceId,
  deliveredVia,
} from '@ratemix/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { trpc } from '@/lib/trpc';

/** Built-in catalog so the mixer renders instantly, before the server list arrives. */
const fallback: RatingSourceDto[] = SOURCE_CATALOG.map((source) => ({
  ...source,
  providerDisplayName: PROVIDERS[source.provider].displayName,
  deliveredVia: deliveredVia(source),
  available: true,
}));

export const useSourcesStore = defineStore('sources', () => {
  const sources = ref<RatingSourceDto[]>(fallback);
  const loaded = ref(false);
  let pending: Promise<void> | null = null;

  const byId = computed(
    () => new Map<SourceId, RatingSourceDto>(sources.value.map((s) => [s.id, s])),
  );

  function load(): Promise<void> {
    if (loaded.value) return Promise.resolve();
    pending ??= trpc.sources.list
      .query()
      .then((list) => {
        if (list.length) sources.value = list;
        loaded.value = true;
      })
      .catch(() => {
        // Keep the built-in catalog; the mixer still works offline.
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  return { sources, loaded, byId, load };
});
