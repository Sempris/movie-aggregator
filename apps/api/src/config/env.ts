import { z } from 'zod';

const booleanFlag = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/** Treats empty strings (e.g. `TMDB_API_KEY=` in .env) as "not set". */
const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() ? value.trim() : undefined));

const csv = z.string().transform((value) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean),
);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    RUN_WORKERS: booleanFlag.default(true),
    TRUST_PROXY: booleanFlag.default(false),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

    FRONTEND_URL: z.url().default('http://localhost:5173'),
    CORS_ORIGINS: csv.default(['http://localhost:5173']),

    TMDB_API_KEY: optionalSecret,
    OMDB_API_KEY: optionalSecret,
    OMDB_DAILY_LIMIT: z.coerce.number().int().positive().default(950),
    OMDB_SCHEDULED_SHARE: z.coerce.number().min(0).max(1).default(0.7),
    TRAKT_CLIENT_ID: optionalSecret,

    REFRESH_HOURS_HOT: z.coerce.number().positive().default(6),
    REFRESH_HOURS_RECENT: z.coerce.number().positive().default(12),
    REFRESH_HOURS_STABLE: z.coerce.number().positive().default(24),
    SCHEDULER_INTERVAL_MINUTES: z.coerce.number().int().min(5).default(60),
    CATALOG_SYNC_CRON: z.string().min(1).default('0 */6 * * *'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
    COOKIE_SECURE: booleanFlag.default(false),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    OAUTH_REDIRECT_BASE_URL: z.url().default('http://localhost:5173'),
    GITHUB_CLIENT_ID: optionalSecret,
    GITHUB_CLIENT_SECRET: optionalSecret,
    GOOGLE_CLIENT_ID: optionalSecret,
    GOOGLE_CLIENT_SECRET: optionalSecret,

    SENTRY_DSN: optionalSecret,
    SENTRY_ENVIRONMENT: optionalSecret,
  })
  .superRefine((env, ctx) => {
    if (env.COOKIE_SAMESITE === 'none' && !env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SAMESITE=none requires COOKIE_SECURE=true (browsers reject it otherwise)',
      });
    }
    if (env.NODE_ENV === 'production' && env.JWT_ACCESS_SECRET.startsWith('replace-me')) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message:
          'JWT_ACCESS_SECRET still has the placeholder value from .env.example; generate a real secret',
      });
    }
    const hot = env.REFRESH_HOURS_HOT;
    if (!(
      hot <= env.REFRESH_HOURS_RECENT && env.REFRESH_HOURS_RECENT <= env.REFRESH_HOURS_STABLE
    )) {
      ctx.addIssue({
        code: 'custom',
        path: ['REFRESH_HOURS_HOT'],
        message: 'Expected REFRESH_HOURS_HOT <= REFRESH_HOURS_RECENT <= REFRESH_HOURS_STABLE',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  override readonly name = 'EnvValidationError';
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new EnvValidationError(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

/** Nest injection token for the validated environment. */
export const ENV = Symbol('ENV');
