import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EnvValidationError, loadEnv } from './config/env';
import { TrpcHttpService } from './trpc/trpc-http.service';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot({ http: true, workers: env.RUN_WORKERS }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.use('/trpc', app.get(TrpcHttpService).middleware());
  app.enableShutdownHooks();

  await app.listen(env.PORT);
  app
    .get(Logger)
    .log(
      `RateMix API listening on http://localhost:${env.PORT} (workers ${env.RUN_WORKERS ? 'in-process' : 'disabled'})`,
    );
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof EnvValidationError ? error.message : error);
  process.exit(1);
});
