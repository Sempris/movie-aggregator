import type { SourceId } from '@ratemix/shared';

export function formatScore(score: number | null | undefined): string {
  return score === null || score === undefined ? '–' : String(Math.round(score));
}

export function formatVotes(count: number | null): string | null {
  if (!count) return null;
  const formatted = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(count);
  return `${formatted} ${count === 1 ? 'vote' : 'votes'}`;
}

export function formatRuntime(minutes: number | null): string | null {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} h ${rest.toString().padStart(2, '0')} min` : `${rest} min`;
}

export function formatWeight(weight: number): string {
  return `×${Number.isInteger(weight) ? weight : weight.toFixed(1)}`;
}

export function formatPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function relativeTime(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const diffMinutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** CSS custom property holding each source's channel color. */
export function channelColor(sourceId: SourceId): string {
  return `var(--color-ch-${sourceId.replace('_', '-')})`;
}
