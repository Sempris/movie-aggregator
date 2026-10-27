import { describe, expect, it } from 'vitest';
import { computeCompositeScore, type RatingValue } from '../composite';
import { defaultPreferences, resolvePreferences } from '../preferences';
import { SOURCE_CATALOG } from '../sources';

const ratings: RatingValue[] = [
  { sourceId: 'tmdb', normalizedValue: 72 },
  { sourceId: 'imdb', normalizedValue: 81 },
  { sourceId: 'rotten_tomatoes', normalizedValue: 94 },
  { sourceId: 'metacritic', normalizedValue: 68 },
  { sourceId: 'trakt', normalizedValue: 75 },
];

describe('computeCompositeScore', () => {
  it('averages all sources equally with default preferences', () => {
    const result = computeCompositeScore(ratings, defaultPreferences(SOURCE_CATALOG));
    expect(result.score).toBeCloseTo(78, 10);
    expect(result.totalWeight).toBe(5);
    expect(result.contributions).toHaveLength(5);
    expect(result.contributions.every((c) => c.share === 0.2)).toBe(true);
  });

  it('excludes disabled sources', () => {
    const prefs = resolvePreferences(SOURCE_CATALOG, { rotten_tomatoes: { enabled: false } });
    const result = computeCompositeScore(ratings, prefs);
    expect(result.score).toBeCloseTo((72 + 81 + 68 + 75) / 4, 10);
    expect(result.contributions.map((c) => c.sourceId)).not.toContain('rotten_tomatoes');
  });

  it('applies weights', () => {
    const prefs = resolvePreferences(SOURCE_CATALOG, {
      rotten_tomatoes: { enabled: false },
      imdb: { weight: 2 },
    });
    const result = computeCompositeScore(ratings, prefs);
    expect(result.score).toBeCloseTo((72 + 81 * 2 + 68 + 75) / 5, 10);
    expect(result.contributions.find((c) => c.sourceId === 'imdb')?.share).toBeCloseTo(0.4, 10);
  });

  it('recomputes from whatever sources have data and reports the missing ones', () => {
    const partial = ratings.filter((r) => r.sourceId === 'tmdb' || r.sourceId === 'imdb');
    const result = computeCompositeScore(partial, defaultPreferences(SOURCE_CATALOG));
    expect(result.score).toBeCloseTo(76.5, 10);
    expect(result.missingSources.sort()).toEqual(['metacritic', 'rotten_tomatoes', 'trakt']);
  });

  it('returns null when nothing enabled has a score', () => {
    const prefs = resolvePreferences(SOURCE_CATALOG, { tmdb: { enabled: false } });
    const result = computeCompositeScore([{ sourceId: 'tmdb', normalizedValue: 70 }], prefs);
    expect(result.score).toBeNull();
    expect(result.contributions).toEqual([]);
  });

  it('treats zero weight like disabled and ignores duplicate or non-finite ratings', () => {
    const prefs = resolvePreferences(SOURCE_CATALOG, { imdb: { weight: 0 } });
    const result = computeCompositeScore(
      [
        { sourceId: 'tmdb', normalizedValue: 60 },
        { sourceId: 'tmdb', normalizedValue: 10 },
        { sourceId: 'imdb', normalizedValue: 90 },
        { sourceId: 'trakt', normalizedValue: Number.NaN },
      ],
      prefs,
    );
    expect(result.score).toBe(60);
  });
});
