import { type CompositeScore, type SourceRatingDto, computeCompositeScore } from '@ratemix/shared';
import { type MaybeRefOrGetter, computed, toValue } from 'vue';
import { useSourcePreferencesStore } from '@/stores/sourcePreferences';

/** Recomputes "Your score" whenever preferences change. Pure client-side math. */
export function useCompositeScore(
  movie: MaybeRefOrGetter<{ ratings: SourceRatingDto[] } | null | undefined>,
) {
  const preferences = useSourcePreferencesStore();
  return computed<CompositeScore | null>(() => {
    const value = toValue(movie);
    return value ? computeCompositeScore(value.ratings, preferences.resolved) : null;
  });
}
