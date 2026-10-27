import { vi } from 'vitest';

export interface MockRoute {
  match: (url: URL, init?: RequestInit) => boolean;
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Minimal fetch double: first matching route wins; unmatched requests fail the test. */
export function mockFetch(routes: MockRoute[]) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const route = routes.find((candidate) => candidate.match(url, init));
    if (!route) throw new Error(`Unexpected request: ${url.href}`);
    return new Response(route.body === undefined ? '' : JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json', ...route.headers },
    });
  });
}

export class MemoryQuotaStore {
  readonly values = new Map<string, number>();
  async incrementIfBelow(key: string, cap: number): Promise<number | null> {
    const current = this.values.get(key) ?? 0;
    if (current >= cap) return null;
    this.values.set(key, current + 1);
    return current + 1;
  }
  async get(key: string): Promise<number> {
    return this.values.get(key) ?? 0;
  }
  async set(key: string, value: number): Promise<void> {
    this.values.set(key, value);
  }
}
