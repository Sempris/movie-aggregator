export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** UTC calendar day key, e.g. "2026-09-10". */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** UTC hour key, e.g. "2026-09-10T14". */
export function utcHourKey(date: Date): string {
  return date.toISOString().slice(0, 13);
}

export function nextUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

export function hoursAgo(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * HOUR_MS);
}
