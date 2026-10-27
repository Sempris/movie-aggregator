import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { RedisService } from '../core/redis.service';
import { AdapterRegistry, OMDB_QUOTA } from '../sources/adapter-registry';
import { DailyQuota, RedisQuotaStore } from '../sources/quota';
import { TmdbClient } from '../sources/tmdb/tmdb.client';
import { IngestionStatsService } from './ingestion-stats.service';
import { IngestionService } from './ingestion.service';
import { MovieCacheService } from './movie-cache.service';
import { QueueRegistry } from './queue-registry';
import { RatingsRepository } from './ratings.repository';
import { SourcesService } from './sources.service';

@Module({
  providers: [
    {
      provide: TmdbClient,
      inject: [ENV],
      useFactory: (env: Env) => new TmdbClient(env.TMDB_API_KEY),
    },
    {
      provide: OMDB_QUOTA,
      inject: [ENV, RedisService],
      useFactory: (env: Env, redis: RedisService) =>
        new DailyQuota(
          new RedisQuotaStore(redis.client),
          'omdb',
          env.OMDB_DAILY_LIMIT,
          env.OMDB_SCHEDULED_SHARE,
        ),
    },
    AdapterRegistry,
    SourcesService,
    MovieCacheService,
    RatingsRepository,
    QueueRegistry,
    IngestionService,
    IngestionStatsService,
  ],
  exports: [
    TmdbClient,
    OMDB_QUOTA,
    AdapterRegistry,
    SourcesService,
    MovieCacheService,
    RatingsRepository,
    QueueRegistry,
    IngestionService,
    IngestionStatsService,
  ],
})
export class CatalogModule {}
