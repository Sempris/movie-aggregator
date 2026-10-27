import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EnvValidationError, loadEnv } from './config/env';

/** Standalone ingestion worker process (no HTTP server). */
async function bootstrap(): Promise<void> {
  loadEnv();
  const app = await NestFactory.createApplicationContext(
    AppModule.forRoot({ http: false, workers: true }),
    {
      bufferLogs: true,
    },
  );
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.init();
  app.get(Logger).log('RateMix ingestion worker running');
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof EnvValidationError ? error.message : error);
  process.exit(1);
});
