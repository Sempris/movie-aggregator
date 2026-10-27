import { setAllPreferencesInput, updatePreferenceInput } from '@ratemix/shared';
import type { PreferencesApi } from '../deps';
import { protectedProcedure, router } from '../trpc';

export function createPreferencesRouter(preferences: PreferencesApi) {
  return router({
    get: protectedProcedure.query(({ ctx }) => preferences.get(ctx.user.id)),
    update: protectedProcedure
      .input(updatePreferenceInput)
      .mutation(({ ctx, input }) => preferences.update(ctx.user.id, input)),
    /** Replaces preferences for the listed sources; used for debounced sync and login merges. */
    setAll: protectedProcedure
      .input(setAllPreferencesInput)
      .mutation(({ ctx, input }) => preferences.setAll(ctx.user.id, input)),
    reset: protectedProcedure.mutation(({ ctx }) => preferences.reset(ctx.user.id)),
  });
}
