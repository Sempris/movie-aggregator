import { describe, expect, it } from 'vitest';
import { formatRawScore, normalizeScore } from '../normalize';

describe('normalizeScore', () => {
  it('maps 10-point scales onto 0-100', () => {
    expect(normalizeScore(7.8, 0, 10)).toBe(78);
    expect(normalizeScore(7.33, 0, 10)).toBe(73.3);
  });

  it('keeps 100-point scales as-is', () => {
    expect(normalizeScore(91, 0, 100)).toBe(91);
  });

  it('handles scales that do not start at zero', () => {
    // e.g. a 0.5-5 star scale
    expect(normalizeScore(0.5, 0.5, 5)).toBe(0);
    expect(normalizeScore(5, 0.5, 5)).toBe(100);
    expect(normalizeScore(2.75, 0.5, 5)).toBe(50);
  });

  it('clamps out-of-range values', () => {
    expect(normalizeScore(10.4, 0, 10)).toBe(100);
    expect(normalizeScore(-1, 0, 10)).toBe(0);
  });

  it('rejects invalid input', () => {
    expect(() => normalizeScore(Number.NaN, 0, 10)).toThrow(RangeError);
    expect(() => normalizeScore(5, 10, 10)).toThrow(RangeError);
  });
});

describe('formatRawScore', () => {
  it('formats each source style', () => {
    expect(formatRawScore(7.8, 'out_of_10')).toBe('7.8/10');
    expect(formatRawScore(8, 'out_of_10')).toBe('8.0/10');
    expect(formatRawScore(91, 'percent')).toBe('91%');
    expect(formatRawScore(74, 'out_of_100')).toBe('74/100');
  });
});
