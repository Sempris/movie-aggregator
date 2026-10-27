import { describe, expect, it } from 'vitest';
import { mockFetch } from '../../test/fetch-mock';
import { githubProvider, googleProvider } from './oauth.providers';

describe('OAuth providers', () => {
  it('builds a GitHub authorize URL with state and redirect', () => {
    const url = new URL(
      githubProvider('id', 'secret').authorizeUrl('st4te', 'http://localhost:5173/cb'),
    );
    expect(url.origin).toBe('https://github.com');
    expect(url.searchParams.get('state')).toBe('st4te');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5173/cb');
  });

  it('exchanges a GitHub code and only trusts a verified primary email', async () => {
    const fetchFn = mockFetch([
      {
        match: (url) => url.pathname === '/login/oauth/access_token',
        body: { access_token: 'gho_x' },
      },
      { match: (url) => url.pathname === '/user', body: { id: 42, login: 'octo', name: null } },
      {
        match: (url) => url.pathname === '/user/emails',
        body: [
          { email: 'old@example.com', primary: false, verified: true },
          { email: 'octo@example.com', primary: true, verified: true },
        ],
      },
    ]);
    const profile = await githubProvider('id', 'secret', fetchFn).exchange('code', 'http://cb');
    expect(profile).toEqual({
      provider: 'github',
      accountId: '42',
      email: 'octo@example.com',
      emailVerified: true,
      displayName: 'octo',
    });
  });

  it('exchanges a Google code', async () => {
    const fetchFn = mockFetch([
      { match: (url) => url.hostname === 'oauth2.googleapis.com', body: { access_token: 'ya29' } },
      {
        match: (url) => url.hostname === 'openidconnect.googleapis.com',
        body: { sub: '123', email: 'a@example.com', email_verified: true, name: 'A' },
      },
    ]);
    const profile = await googleProvider('id', 'secret', fetchFn).exchange('code', 'http://cb');
    expect(profile).toMatchObject({ provider: 'google', accountId: '123', emailVerified: true });
  });
});
