import type { SourceId } from './sources';

/** Weights are relative; the composite divides by the sum of enabled weights. */
export const WEIGHT_MIN = 0;
export const WEIGHT_MAX = 5;
/** Smallest weight the UI offers; use the toggle to exclude a source entirely. */
export const WEIGHT_UI_MIN = 0.5;
export const WEIGHT_STEP = 0.5;

export interface SourcePreference {
  enabled: boolean;
  weight: number;
}

export type PreferenceMap = Partial<Record<SourceId, SourcePreference>>;
export type PreferenceOverrides = Partial<Record<SourceId, Partial<SourcePreference>>>;

export interface SourceDefaults {
  id: SourceId;
  defaultWeight: number;
}

export function clampWeight(weight: number): number {
  if (!Number.isFinite(weight)) return WEIGHT_MIN;
  return Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, weight));
}

/** All sources enabled at their default weight, which is what guests start with. */
export function defaultPreferences(sources: readonly SourceDefaults[]): PreferenceMap {
  const map: PreferenceMap = {};
  for (const source of sources) {
    map[source.id] = { enabled: true, weight: clampWeight(source.defaultWeight) };
  }
  return map;
}

/**
 * Fills in defaults for any source the user hasn't customized. Overrides for
 * sources that no longer exist are dropped.
 */
export function resolvePreferences(
  sources: readonly SourceDefaults[],
  overrides: PreferenceOverrides | undefined,
): PreferenceMap {
  const resolved: PreferenceMap = {};
  for (const source of sources) {
    const override = overrides?.[source.id];
    resolved[source.id] = {
      enabled: override?.enabled ?? true,
      weight: clampWeight(override?.weight ?? source.defaultWeight),
    };
  }
  return resolved;
}

export function isDefaultPreferences(
  sources: readonly SourceDefaults[],
  preferences: PreferenceMap,
): boolean {
  return sources.every((source) => {
    const preference = preferences[source.id];
    return (
      preference === undefined ||
      (preference.enabled && preference.weight === clampWeight(source.defaultWeight))
    );
  });
}

export function preferencesEqual(a: PreferenceMap, b: PreferenceMap): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as SourceId[]);
  for (const key of keys) {
    const left = a[key];
    const right = b[key];
    if (!left || !right) return false;
    if (left.enabled !== right.enabled || left.weight !== right.weight) return false;
  }
  return true;
}
