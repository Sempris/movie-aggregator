import {
  type PreferencesDto,
  SOURCE_CATALOG,
  defaultPreferences,
  resolvePreferences,
} from '@ratemix/shared';
import { describe, expect, it } from 'vitest';
import { decideMerge } from '@/lib/preferenceMerge';

const server = (
  customized: boolean,
  overrides: Record<string, { enabled: boolean; weight: number }> = {},
): PreferencesDto => ({
  customized,
  updatedAt: customized ? '2026-09-01T00:00:00Z' : null,
  preferences: SOURCE_CATALOG.map((source) => ({
    sourceId: source.id,
    enabled: overrides[source.id]?.enabled ?? true,
    weight: overrides[source.id]?.weight ?? 1,
  })),
});

describe('decideMerge', () => {
  const defaults = defaultPreferences(SOURCE_CATALOG);
  const localCustom = resolvePreferences(SOURCE_CATALOG, { trakt: { enabled: false } });

  it('does nothing when neither side is customized', () => {
    expect(decideMerge(SOURCE_CATALOG, defaults, server(false))).toBe('in_sync');
  });

  it("uploads this browser's mix when the account has none", () => {
    expect(decideMerge(SOURCE_CATALOG, localCustom, server(false))).toBe('push_local');
  });

  it("adopts the account's mix when this browser has none", () => {
    expect(
      decideMerge(SOURCE_CATALOG, defaults, server(true, { imdb: { enabled: true, weight: 3 } })),
    ).toBe('adopt_server');
  });

  it('asks when both sides differ', () => {
    expect(
      decideMerge(
        SOURCE_CATALOG,
        localCustom,
        server(true, { imdb: { enabled: true, weight: 3 } }),
      ),
    ).toBe('ask');
  });

  it('treats identical custom mixes as in sync', () => {
    expect(
      decideMerge(
        SOURCE_CATALOG,
        localCustom,
        server(true, { trakt: { enabled: false, weight: 1 } }),
      ),
    ).toBe('in_sync');
  });
});
