import { type DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { ENV, type Env } from './config/env';
import { CoreModule } from './core/core.module';
import { HealthModule } from './health/health.module';
import { MoviesModule } from './movies/movies.module';
import { PreferencesModule } from './preferences/preferences.module';
import { TrpcModule } from './trpc/trpc.module';
import { WorkersModule } from './workers/workers.module';

export interface AppModuleOptions {
  /** Serve HTTP (tRPC, OAuth, health). */
  http: boolean;
  /** Run BullMQ ingestion workers and job schedulers in this process. */
  workers: boolean;
}

const logger = LoggerModule.forRootAsync({
  inject: [ENV],
  useFactory: (env: Env) => ({
    pinoHttp: {
      level: env.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      autoLogging: { ignore: (req) => req.url === '/health' },
      ...(env.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
            },
          }
        : {}),
    },
  }),
});

@Module({})
export class AppModule {
  static forRoot(options: AppModuleOptions): DynamicModule {
    const imports: NonNullable<ModuleMetadata['imports']> = [
      SentryModule.forRoot(),
      CoreModule,
      logger,
      CatalogModule,
    ];
    if (options.http)
      imports.push(AuthModule, PreferencesModule, MoviesModule, TrpcModule, HealthModule);
    if (options.workers) imports.push(WorkersModule);

    return {
      module: AppModule,
      imports,
      providers: options.http ? [{ provide: APP_FILTER, useClass: SentryGlobalFilter }] : [],
    };
  }
}
