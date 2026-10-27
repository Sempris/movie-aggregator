import type { ProviderId } from '@ratemix/shared';
import { UpstreamError, errorMessage } from './errors';

export type FetchFn = typeof fetch;

export interface JsonResponse<T> {
  status: number;
  headers: Headers;
  body: T | null;
}

export const USER_AGENT = 'RateMix/0.1 (+https://github.com/ratemix)';

/**
 * Fetches a URL and parses JSON without throwing on non-2xx statuses, so adapters
 * can map provider-specific status codes. Network failures and timeouts become
 * retryable UpstreamErrors.
 */
export async function requestJson<T>(
  provider: ProviderId,
  url: string,
  init: RequestInit = {},
  options: { fetchFn?: FetchFn; timeoutMs?: number } = {},
): Promise<JsonResponse<T>> {
  const fetchFn = options.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await fetchFn(url, {
      ...init,
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
  } catch (error) {
    throw new UpstreamError(provider, null, `request failed: ${errorMessage(error)}`);
  }

  const text = await response.text().catch(() => '');
  let body: T | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as T;
    } catch {
      if (response.ok) {
        throw new UpstreamError(provider, response.status, 'response was not valid JSON');
      }
    }
  }
  return { status: response.status, headers: response.headers, body };
}

/** Parses a Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfterMs(
  header: string | null,
  fallbackMs: number,
  now = Date.now(),
): number {
  if (!header) return fallbackMs;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1000, seconds * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(1000, date - now);
  return fallbackMs;
}
