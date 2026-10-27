import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from './env';

const minimal = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
};

describe('loadEnv', () => {
  it('applies defaults and treats empty secrets as unset', () => {
    const env = loadEnv({
      ...minimal,
      TMDB_API_KEY: '',
      CORS_ORIGINS: 'http://a.test, http://b.test',
    });
    expect(env.PORT).toBe(3000);
    expect(env.RUN_WORKERS).toBe(true);
    expect(env.TMDB_API_KEY).toBeUndefined();
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('reports every problem at once', () => {
    expect(() => loadEnv({ JWT_ACCESS_SECRET: 'short' })).toThrow(EnvValidationError);
    try {
      loadEnv({ JWT_ACCESS_SECRET: 'short' });
    } catch (error) {
      expect((error as Error).message).toContain('DATABASE_URL');
      expect((error as Error).message).toContain('JWT_ACCESS_SECRET');
    }
  });

  it('refuses the placeholder JWT secret in production', () => {
    const placeholder = 'replace-me-with-a-long-random-string-of-at-least-32-chars';
    expect(() =>
      loadEnv({ ...minimal, NODE_ENV: 'production', JWT_ACCESS_SECRET: placeholder }),
    ).toThrow(/placeholder/);
    expect(loadEnv({ ...minimal, JWT_ACCESS_SECRET: placeholder }).NODE_ENV).toBe('development');
  });

  it('rejects SameSite=None without Secure', () => {
    expect(() => loadEnv({ ...minimal, COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'false' })).toThrow(
      /COOKIE_SECURE/,
    );
  });
});
