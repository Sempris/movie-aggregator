import type { PreferencesDto } from '@ratemix/shared';
import { useDebounceFn } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { decideMerge, serverPreferenceMap } from '@/lib/preferenceMerge';
import { trpc } from '@/lib/trpc';
import { useAuthStore } from './auth';
import { useSourcePreferencesStore } from './sourcePreferences';
import { useSourcesStore } from './sources';

export type SyncStatus = 'local' | 'saving' | 'saved' | 'error';

/** Mirrors the mix to the account for signed-in users and reconciles on sign-in. */
export const usePreferenceSyncStore = defineStore('preferenceSync', () => {
  const auth = useAuthStore();
  const preferences = useSourcePreferencesStore();
  const sources = useSourcesStore();

  const status = ref<SyncStatus>('local');
  /** Set when both this device and the account have different custom mixes. */
  const conflict = ref<PreferencesDto | null>(null);
  let started = false;

  async function push() {
    if (!auth.isAuthenticated) return;
    status.value = 'saving';
    try {
      const saved = await trpc.preferences.setAll.mutate({ preferences: preferences.toDtoList() });
      preferences.updatedAt = saved.updatedAt;
      status.value = 'saved';
    } catch {
      status.value = 'error';
    }
  }
  const pushDebounced = useDebounceFn(push, 600);

  async function reconcile() {
    status.value = 'saving';
    try {
      await sources.load();
      const server = await trpc.preferences.get.query();
      const decision = decideMerge(sources.sources, preferences.resolved, server);
      if (decision === 'push_local') return push();
      if (decision === 'adopt_server')
        preferences.applyRemote(server.preferences, server.updatedAt);
      if (decision === 'ask') {
        conflict.value = server;
        status.value = 'local';
        return;
      }
      status.value = 'saved';
    } catch {
      status.value = 'error';
    }
  }

  function resolveConflict(choice: 'keep_device' | 'use_account') {
    const server = conflict.value;
    conflict.value = null;
    if (!server) return;
    if (choice === 'use_account') {
      const map = serverPreferenceMap(sources.sources, server);
      preferences.applyRemote(
        sources.sources.map(({ id }) => ({ sourceId: id, ...map[id]! })),
        server.updatedAt,
      );
      status.value = 'saved';
    } else {
      void push();
    }
  }

  function start() {
    if (started) return;
    started = true;
    watch(
      () => auth.status,
      (next, previous) => {
        if (next === 'authenticated' && previous !== 'authenticated') void reconcile();
        if (next === 'guest') {
          status.value = 'local';
          conflict.value = null;
        }
      },
    );
    watch(
      () => preferences.localRevision,
      () => {
        if (auth.isAuthenticated && !conflict.value) {
          status.value = 'saving';
          void pushDebounced();
        }
      },
    );
  }

  return { status, conflict, start, resolveConflict, retry: push };
});
