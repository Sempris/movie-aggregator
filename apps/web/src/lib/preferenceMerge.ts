import {
  type PreferenceMap,
  type PreferencesDto,
  type SourceDefaults,
  isDefaultPreferences,
  preferencesEqual,
  resolvePreferences,
} from '@ratemix/shared';

export type MergeDecision = 'in_sync' | 'push_local' | 'adopt_server' | 'ask';

export function serverPreferenceMap(
  sources: readonly SourceDefaults[],
  dto: PreferencesDto,
): PreferenceMap {
  return resolvePreferences(
    sources,
    Object.fromEntries(
      dto.preferences.map(({ sourceId, enabled, weight }) => [sourceId, { enabled, weight }]),
    ),
  );
}

/**
 * Decides what to do with this device's mix when someone signs in:
 * only one side customized → that side wins; both customized and different → ask.
 */
export function decideMerge(
  sources: readonly SourceDefaults[],
  local: PreferenceMap,
  server: PreferencesDto,
): MergeDecision {
  const remote = serverPreferenceMap(sources, server);
  const localCustomized = !isDefaultPreferences(sources, local);
  const serverCustomized = server.customized && !isDefaultPreferences(sources, remote);

  if (preferencesEqual(local, remote)) return 'in_sync';
  if (localCustomized && !serverCustomized) return 'push_local';
  if (!localCustomized && serverCustomized) return 'adopt_server';
  if (!localCustomized && !serverCustomized) return 'in_sync';
  return 'ask';
}
