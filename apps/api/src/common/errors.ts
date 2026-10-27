import type { ProviderId } from '@ratemix/shared';

/** The provider asked us to slow down (HTTP 429); retry after the given delay. */
export class RateLimitedError extends Error {
  override readonly name = 'RateLimitedError';
  constructor(
    readonly provider: ProviderId,
    readonly retryAfterMs: number,
  ) {
    super(`${provider} rate limit hit; retry in ${Math.ceil(retryAfterMs / 1000)}s`);
  }
}

export type QuotaScope = 'scheduled_share' | 'daily_cap';

/** Our own request budget for a provider is used up until `resetAt`. */
export class QuotaExceededError extends Error {
  override readonly name = 'QuotaExceededError';
  constructor(
    readonly provider: ProviderId,
    readonly scope: QuotaScope,
    readonly resetAt: Date,
  ) {
    super(
      scope === 'daily_cap'
        ? `${provider} daily request limit reached; resets at ${resetAt.toISOString()}`
        : `${provider} budget for scheduled refreshes is used up until ${resetAt.toISOString()}`,
    );
  }
}

/** Misconfiguration that retrying won't fix (e.g. an invalid API key). */
export class PermanentProviderError extends Error {
  override readonly name = 'PermanentProviderError';
  constructor(
    readonly provider: ProviderId,
    message: string,
  ) {
    super(`${provider}: ${message}`);
  }
}

/** Transient upstream failure (network error, 5xx, malformed body); safe to retry. */
export class UpstreamError extends Error {
  override readonly name = 'UpstreamError';
  constructor(
    readonly provider: ProviderId,
    readonly status: number | null,
    message: string,
  ) {
    super(`${provider}: ${message}`);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
