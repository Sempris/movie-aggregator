import { describe, expect, it } from 'vitest';
import {
  WEIGHT_MAX,
  clampWeight,
  defaultPreferences,
  isDefaultPreferences,
  preferencesEqual,
  resolvePreferences,
} from '../preferences';
import { SOURCE_CATALOG } from '../sources';
import { setAllPreferencesInput, updatePreferenceInput } from '../schemas';

describe('preferences', () => {
  it('resolves overrides on top of defaults', () => {
    const resolved = resolvePreferences(SOURCE_CATALOG, { trakt: { enabled: false, weight: 3 } });
    expect(resolved.trakt).toEqual({ enabled: false, weight: 3 });
    expect(resolved.imdb).toEqual({ enabled: true, weight: 1 });
  });

  it('clamps weights into the allowed range', () => {
    expect(clampWeight(99)).toBe(WEIGHT_MAX);
    expect(clampWeight(-2)).toBe(0);
    expect(clampWeight(Number.NaN)).toBe(0);
  });

  it('detects default preferences', () => {
    expect(isDefaultPreferences(SOURCE_CATALOG, defaultPreferences(SOURCE_CATALOG))).toBe(true);
    const changed = resolvePreferences(SOURCE_CATALOG, { imdb: { weight: 2 } });
    expect(isDefaultPreferences(SOURCE_CATALOG, changed)).toBe(false);
  });

  it('compares preference maps', () => {
    const a = defaultPreferences(SOURCE_CATALOG);
    const b = defaultPreferences(SOURCE_CATALOG);
    expect(preferencesEqual(a, b)).toBe(true);
    b.tmdb = { enabled: false, weight: 1 };
    expect(preferencesEqual(a, b)).toBe(false);
  });
});

describe('preference input schemas', () => {
  it('requires at least one field on update', () => {
    expect(updatePreferenceInput.safeParse({ sourceId: 'imdb' }).success).toBe(false);
    expect(updatePreferenceInput.safeParse({ sourceId: 'imdb', weight: 2 }).success).toBe(true);
  });

  it('rejects unknown sources and out-of-range weights', () => {
    expect(
      setAllPreferencesInput.safeParse({
        preferences: [{ sourceId: 'letterboxd', enabled: true, weight: 1 }],
      }).success,
    ).toBe(false);
    expect(
      setAllPreferencesInput.safeParse({
        preferences: [{ sourceId: 'imdb', enabled: true, weight: 50 }],
      }).success,
    ).toBe(false);
  });
});
