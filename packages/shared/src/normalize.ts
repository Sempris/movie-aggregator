import type { RawScoreFormat } from './sources';

/** Every source is mapped onto this shared scale before it's stored. */
export const NORMALIZED_MIN = 0;
export const NORMALIZED_MAX = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Linearly maps a raw score from its native scale onto 0-100.
 * Values outside the scale are clamped rather than rejected, because upstream
 * APIs occasionally return slightly out-of-range numbers.
 */
export function normalizeScore(raw: number, scaleMin: number, scaleMax: number): number {
  if (!Number.isFinite(raw)) {
    throw new RangeError(`Cannot normalize a non-finite score: ${raw}`);
  }
  if (!(scaleMax > scaleMin)) {
    throw new RangeError(`Invalid scale: min ${scaleMin} must be below max ${scaleMax}`);
  }
  const ratio = (raw - scaleMin) / (scaleMax - scaleMin);
  return roundTo(clamp(ratio * NORMALIZED_MAX, NORMALIZED_MIN, NORMALIZED_MAX), 2);
}

/** Renders a raw score the way its source writes it: "7.8/10", "91%", "74/100". */
export function formatRawScore(raw: number, format: RawScoreFormat): string {
  switch (format) {
    case 'out_of_10':
      return `${raw.toFixed(1)}/10`;
    case 'percent':
      return `${Math.round(raw)}%`;
    case 'out_of_100':
      return `${Math.round(raw)}/100`;
  }
}
