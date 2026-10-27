// Loaded first by main.ts and worker.ts: reads .env, then initializes Sentry before
// anything else is imported so its instrumentation can hook into modules.
import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';

if (process.env['SENTRY_DSN']) {
  Sentry.init({
    dsn: process.env['SENTRY_DSN'],
    environment: process.env['SENTRY_ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'development',
    tracesSampleRate: 0,
  });
}
