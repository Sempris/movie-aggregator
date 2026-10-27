import type { PreferenceMap } from './preferences';
import type { SourceId } from './sources';

export interface RatingValue {
  sourceId: SourceId;
  /** Score on the shared 0-100 scale. */
  normalizedValue: number;
}

export interface CompositeContribution {
  sourceId: SourceId;
  normalizedValue: number;
  weight: number;
  /** Fraction of the final score this source accounts for (0-1). */
  share: number;
}

export interface CompositeScore {
  /** Weighted average on 0-100, or null when no enabled source has a score. */
  score: number | null;
  contributions: CompositeContribution[];
  totalWeight: number;
  /** Sources the user has enabled that have no score for this title. */
  missingSources: SourceId[];
}

/**
 * composite = Σ(normalized_i × weight_i) / Σ(weight_i) over enabled sources that
 * have a score. Sources without a preference entry are treated as disabled, so
 * callers should pass preferences resolved against the source catalog.
 */
export function computeCompositeScore(
  ratings: readonly RatingValue[],
  preferences: PreferenceMap,
): CompositeScore {
  const ratedSources = new Set<SourceId>();
  const included: Array<Omit<CompositeContribution, 'share'>> = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const rating of ratings) {
    if (ratedSources.has(rating.sourceId) || !Number.isFinite(rating.normalizedValue)) continue;
    ratedSources.add(rating.sourceId);
    const preference = preferences[rating.sourceId];
    if (!preference?.enabled || !(preference.weight > 0)) continue;
    weightedSum += rating.normalizedValue * preference.weight;
    totalWeight += preference.weight;
    included.push({
      sourceId: rating.sourceId,
      normalizedValue: rating.normalizedValue,
      weight: preference.weight,
    });
  }

  const missingSources = (Object.keys(preferences) as SourceId[]).filter((sourceId) => {
    const preference = preferences[sourceId];
    return Boolean(preference?.enabled && preference.weight > 0 && !ratedSources.has(sourceId));
  });

  if (totalWeight === 0) {
    return { score: null, contributions: [], totalWeight: 0, missingSources };
  }

  return {
    score: weightedSum / totalWeight,
    contributions: included.map((entry) => ({ ...entry, share: entry.weight / totalWeight })),
    totalWeight,
    missingSources,
  };
}
