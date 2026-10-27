import { ref } from 'vue';

/**
 * In-memory access token (never persisted, so XSS can't read it from storage).
 * Kept outside Pinia so the tRPC client can use it without importing stores.
 */
const accessToken = ref<string | null>(null);
let refresher: (() => Promise<boolean>) | null = null;
let inFlight: Promise<boolean> | null = null;

export const session = {
  token: accessToken,
  get(): string | null {
    return accessToken.value;
  },
  set(token: string): void {
    accessToken.value = token;
  },
  clear(): void {
    accessToken.value = null;
  },
  registerRefresher(fn: () => Promise<boolean>): void {
    refresher = fn;
  },
  /** Refreshes once even if many requests fail with 401 at the same time. */
  refresh(): Promise<boolean> {
    if (!refresher) return Promise.resolve(false);
    inFlight ??= refresher().finally(() => {
      inFlight = null;
    });
    return inFlight;
  },
};
