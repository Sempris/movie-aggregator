import {
  type PreferenceMap,
  type SourceId,
  type SourcePreference,
  type SourcePreferenceDto,
  clampWeight,
  isDefaultPreferences,
  resolvePreferences,
} from '@ratemix/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useSourcesStore } from './sources';

/**
 * Source of truth for which sources are on and how much each counts. Persists to
 * localStorage (guest mode); usePreferenceSync mirrors it to the account when signed in.
 */
export const useSourcePreferencesStore = defineStore(
  'sourcePreferences',
  () => {
    const sourcesStore = useSourcesStore();
    const overrides = ref<Partial<Record<SourceId, SourcePreference>>>({});
    const updatedAt = ref<string | null>(null);
    /** Bumped only by the person's own edits, so sync can ignore server-applied changes. */
    const localRevision = ref(0);

    const resolved = computed<PreferenceMap>(() =>
      resolvePreferences(sourcesStore.sources, overrides.value),
    );
    const customized = computed(() => !isDefaultPreferences(sourcesStore.sources, resolved.value));
    const enabledCount = computed(
      () => Object.values(resolved.value).filter((preference) => preference?.enabled).length,
    );

    function edit(sourceId: SourceId, patch: Partial<SourcePreference>) {
      const current = resolved.value[sourceId] ?? { enabled: true, weight: 1 };
      overrides.value = { ...overrides.value, [sourceId]: { ...current, ...patch } };
      updatedAt.value = new Date().toISOString();
      localRevision.value += 1;
    }

    function setEnabled(sourceId: SourceId, enabled: boolean) {
      edit(sourceId, { enabled });
    }

    function setWeight(sourceId: SourceId, weight: number) {
      edit(sourceId, { weight: clampWeight(weight) });
    }

    function reset() {
      overrides.value = {};
      updatedAt.value = new Date().toISOString();
      localRevision.value += 1;
    }

    /** Applies preferences from the server without counting as a local edit. */
    function applyRemote(
      preferences: readonly SourcePreferenceDto[],
      remoteUpdatedAt: string | null,
    ) {
      overrides.value = Object.fromEntries(
        preferences.map(({ sourceId, enabled, weight }) => [sourceId, { enabled, weight }]),
      );
      updatedAt.value = remoteUpdatedAt;
    }

    function toDtoList(): SourcePreferenceDto[] {
      return sourcesStore.sources.map(({ id }) => ({ sourceId: id, ...resolved.value[id]! }));
    }

    return {
      overrides,
      updatedAt,
      localRevision,
      resolved,
      customized,
      enabledCount,
      setEnabled,
      setWeight,
      reset,
      applyRemote,
      toDtoList,
    };
  },
  {
    persist: { key: 'ratemix:source-preferences', pick: ['overrides', 'updatedAt'] },
  },
);
