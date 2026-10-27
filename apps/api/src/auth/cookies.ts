import type { CookieOptions } from 'express';
import type { Env } from '../config/env';

export const REFRESH_COOKIE = 'rm_refresh';
/** The refresh cookie is only ever sent to tRPC endpoints. */
export const REFRESH_COOKIE_PATH = '/trpc';
export const OAUTH_STATE_COOKIE = 'rm_oauth_state';
export const OAUTH_COOKIE_PATH = '/auth/oauth';

export function refreshCookieOptions(env: Env, expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: REFRESH_COOKIE_PATH,
    ...(expires ? { expires } : {}),
  };
}

export function oauthStateCookieOptions(env: Env): CookieOptions {
  // Lax so the cookie survives the top-level redirect back from the provider.
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: OAUTH_COOKIE_PATH,
    maxAge: 10 * 60_000,
  };
}
