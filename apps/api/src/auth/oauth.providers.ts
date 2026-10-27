import { Inject, Injectable } from '@nestjs/common';
import type { OAuthProviderId } from '@ratemix/shared';
import { type FetchFn, USER_AGENT } from '../common/http';
import { ENV, type Env } from '../config/env';
import type { OAuthProfile } from './auth.service';

export interface OAuthProvider {
  id: OAuthProviderId;
  authorizeUrl(state: string, redirectUri: string): string;
  exchange(code: string, redirectUri: string): Promise<OAuthProfile>;
}

export class OAuthExchangeError extends Error {
  override readonly name = 'OAuthExchangeError';
}

async function json<T>(response: Response, step: string): Promise<T> {
  if (!response.ok) throw new OAuthExchangeError(`${step} failed with HTTP ${response.status}`);
  return (await response.json()) as T;
}

export function githubProvider(
  clientId: string,
  clientSecret: string,
  fetchFn: FetchFn = fetch,
): OAuthProvider {
  return {
    id: 'github',
    authorizeUrl(state, redirectUri) {
      const url = new URL('https://github.com/login/oauth/authorize');
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'read:user user:email',
        state,
        allow_signup: 'true',
      }).toString();
      return url.toString();
    },
    async exchange(code, redirectUri) {
      const token = await json<{ access_token?: string; error?: string }>(
        await fetchFn('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': USER_AGENT,
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: redirectUri,
          }),
        }),
        'GitHub token exchange',
      );
      if (!token.access_token)
        throw new OAuthExchangeError(`GitHub token exchange failed: ${token.error ?? 'no token'}`);
      const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token.access_token}`,
        'User-Agent': USER_AGENT,
      };
      const user = await json<{ id: number; login: string; name: string | null }>(
        await fetchFn('https://api.github.com/user', { headers }),
        'GitHub profile',
      );
      const emails = await json<Array<{ email: string; primary: boolean; verified: boolean }>>(
        await fetchFn('https://api.github.com/user/emails', { headers }),
        'GitHub emails',
      ).catch(() => []);
      const primary = emails.find((entry) => entry.primary && entry.verified);
      return {
        provider: 'github',
        accountId: String(user.id),
        email: primary?.email ?? null,
        emailVerified: Boolean(primary),
        displayName: user.name ?? user.login,
      };
    },
  };
}

export function googleProvider(
  clientId: string,
  clientSecret: string,
  fetchFn: FetchFn = fetch,
): OAuthProvider {
  return {
    id: 'google',
    authorizeUrl(state, redirectUri) {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account',
      }).toString();
      return url.toString();
    },
    async exchange(code, redirectUri) {
      const token = await json<{ access_token?: string }>(
        await fetchFn('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        }),
        'Google token exchange',
      );
      if (!token.access_token)
        throw new OAuthExchangeError('Google token exchange returned no access token');
      const profile = await json<{
        sub: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
      }>(
        await fetchFn('https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { Authorization: `Bearer ${token.access_token}` },
        }),
        'Google profile',
      );
      return {
        provider: 'google',
        accountId: profile.sub,
        email: profile.email ?? null,
        emailVerified: profile.email_verified === true,
        displayName: profile.name ?? null,
      };
    },
  };
}

/** OAuth providers enabled by environment configuration. */
@Injectable()
export class OAuthProviders {
  private readonly providers = new Map<OAuthProviderId, OAuthProvider>();

  constructor(@Inject(ENV) env: Env) {
    if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
      this.providers.set('github', githubProvider(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET));
    }
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
      this.providers.set('google', googleProvider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET));
    }
  }

  get(id: string): OAuthProvider | undefined {
    return this.providers.get(id as OAuthProviderId);
  }

  enabledIds(): OAuthProviderId[] {
    return [...this.providers.keys()];
  }
}
