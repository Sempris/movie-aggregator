import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSourcePreferencesStore } from '@/stores/sourcePreferences';

describe('source preferences store', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('starts with every source on at equal weight', () => {
    const store = useSourcePreferencesStore();
    expect(store.enabledCount).toBe(5);
    expect(store.customized).toBe(false);
    expect(store.resolved.imdb).toEqual({ enabled: true, weight: 1 });
  });

  it('records edits and counts them as local revisions', () => {
    const store = useSourcePreferencesStore();
    store.setEnabled('rotten_tomatoes', false);
    store.setWeight('imdb', 2.5);
    expect(store.resolved.rotten_tomatoes?.enabled).toBe(false);
    expect(store.resolved.imdb?.weight).toBe(2.5);
    expect(store.customized).toBe(true);
    expect(store.localRevision).toBe(2);
  });

  it('clamps weights and resets to defaults', () => {
    const store = useSourcePreferencesStore();
    store.setWeight('trakt', 99);
    expect(store.resolved.trakt?.weight).toBe(5);
    store.reset();
    expect(store.customized).toBe(false);
  });

  it('applies server preferences without counting a local edit', () => {
    const store = useSourcePreferencesStore();
    store.applyRemote([{ sourceId: 'tmdb', enabled: false, weight: 1 }], '2026-09-01T00:00:00Z');
    expect(store.resolved.tmdb?.enabled).toBe(false);
    expect(store.localRevision).toBe(0);
  });
});
