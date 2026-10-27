import type { MovieDetailDto, PreferencesDto } from '@ratemix/shared';
import { describe, expect, it, vi } from 'vitest';
import type { TrpcContext } from './context';
import type { RouterDeps } from './deps';
import { createAppRouter } from './router';
import { createCallerFactory } from './trpc';

const preferences: PreferencesDto = { preferences: [], customized: false, updatedAt: null };

function deps(): RouterDeps {
  return {
    movies: {
      search: vi.fn(),
      getById: vi.fn(async () => ({ tmdbId: 1 }) as MovieDetailDto),
      trending: vi.fn(),
      popular: vi.fn(),
    },
    preferences: {
      get: vi.fn(async () => preferences),
      update: vi.fn(async () => preferences),
      setAll: vi.fn(async () => preferences),
      reset: vi.fn(async () => preferences),
    },
    sources: { list: vi.fn(async () => []) },
    auth: {
      register: vi.fn(),
      login: vi.fn(async () => ({
        session: {
          user: { id: 'u1', email: 'a@b.c', displayName: null, authProvider: 'password' as const },
          accessToken: 't',
          accessTokenExpiresAt: '',
        },
        refreshToken: { value: 'refresh', expiresAt: new Date('2026-10-01') },
      })),
      refresh: vi.fn(async () => null),
      logout: vi.fn(async () => undefined),
      getUser: vi.fn(async () => null),
    },
    system: { status: vi.fn(), oauthProviders: () => [] },
  };
}

function context(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    user: null,
    invalidToken: false,
    meta: { ip: '127.0.0.1', userAgent: 'test' },
    refreshCookie: { read: vi.fn(() => undefined), write: vi.fn(), clear: vi.fn() },
    ...overrides,
  };
}

const createCaller = createCallerFactory(createAppRouter(deps()));

describe('app router', () => {
  it('passes the viewer to movie queries', async () => {
    const d = deps();
    const caller = createCallerFactory(createAppRouter(d))(context({ user: { id: 'u1' } }));
    await caller.movies.getById({ tmdbId: 603 });
    expect(d.movies.getById).toHaveBeenCalledWith({ tmdbId: 603 }, { userId: 'u1' });
  });

  it('validates input', async () => {
    await expect(createCaller(context()).movies.getById({ tmdbId: -1 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('requires sign-in for preferences', async () => {
    await expect(createCaller(context()).preferences.get()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(createCaller(context({ user: { id: 'u1' } })).preferences.get()).resolves.toEqual(
      preferences,
    );
  });

  it('rejects expired tokens on public procedures but not on auth.refresh', async () => {
    const ctx = context({ invalidToken: true });
    await expect(createCaller(ctx).sources.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(createCaller(ctx).auth.refresh()).resolves.toBeNull();
  });

  it('sets the refresh cookie on login', async () => {
    const d = deps();
    const ctx = context();
    const session = await createCallerFactory(createAppRouter(d))(ctx).auth.login({
      email: 'Someone@Example.com',
      password: 'secret',
    });
    expect(session.accessToken).toBe('t');
    // The shared schema lower-cases emails before they reach the service.
    expect(d.auth.login).toHaveBeenCalledWith(
      { email: 'someone@example.com', password: 'secret' },
      ctx.meta,
    );
    expect(ctx.refreshCookie.write).toHaveBeenCalledWith('refresh', new Date('2026-10-01'));
  });

  it('clears a stale refresh cookie when refresh fails', async () => {
    const ctx = context({
      refreshCookie: { read: vi.fn(() => 'old'), write: vi.fn(), clear: vi.fn() },
    });
    await expect(createCaller(ctx).auth.refresh()).resolves.toBeNull();
    expect(ctx.refreshCookie.clear).toHaveBeenCalled();
  });
});
