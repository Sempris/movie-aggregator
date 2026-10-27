import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ProviderId } from '@ratemix/shared';
import * as Sentry from '@sentry/nestjs';
import { type Job, UnrecoverableError, Worker } from 'bullmq';
import {
  MAINTENANCE_QUEUE,
  type MaintenanceJobName,
  type ProviderJobData,
  QUEUE_PREFIX,
  QueueRegistry,
  providerQueueName,
} from '../catalog/queue-registry';
import { RatingsRepository } from '../catalog/ratings.repository';
import { MovieCacheService } from '../catalog/movie-cache.service';
import {
  PermanentProviderError,
  QuotaExceededError,
  RateLimitedError,
  errorMessage,
} from '../common/errors';
import { ENV, type Env } from '../config/env';
import { RedisService } from '../core/redis.service';
import { AdapterRegistry } from '../sources/adapter-registry';
import { ProviderJobRunner } from './provider-job.runner';
import { SchedulerService } from './scheduler.service';

/**
 * Per-provider concurrency and request pacing, derived from each API's documented
 * limits (TMDB ~50 req/s, Trakt 1,000 req/5 min). OMDb's binding constraint is its
 * daily cap, enforced by DailyQuota; pacing here just keeps bursts polite.
 */
const WORKER_LIMITS: Record<ProviderId, { concurrency: number; max: number; durationMs: number }> =
  {
    tmdb: { concurrency: 4, max: 20, durationMs: 1000 },
    omdb: { concurrency: 2, max: 4, durationMs: 1000 },
    trakt: { concurrency: 2, max: 3, durationMs: 1000 },
  };

@Injectable()
export class WorkersService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkersService.name);
  private readonly workers: Worker[] = [];

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly redis: RedisService,
    private readonly queues: QueueRegistry,
    private readonly registry: AdapterRegistry,
    private readonly runner: ProviderJobRunner,
    private readonly scheduler: SchedulerService,
    private readonly repository: RatingsRepository,
    private readonly cache: MovieCacheService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const adapter of this.registry.all()) {
      this.workers.push(this.createProviderWorker(adapter.providerId));
    }
    this.workers.push(this.createMaintenanceWorker());
    await this.registerSchedules();
    this.logger.log({ providers: this.registry.configuredMap() }, 'Ingestion workers started');
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled(this.workers.map((worker) => worker.close()));
  }

  private createProviderWorker(provider: ProviderId): Worker<ProviderJobData> {
    const limits = WORKER_LIMITS[provider];
    const queue = this.queues.provider(provider);

    const worker = new Worker<ProviderJobData>(
      providerQueueName(provider),
      async (job) => {
        try {
          return await this.runner.run(provider, job.data);
        } catch (error) {
          if (error instanceof RateLimitedError) {
            await queue.rateLimit(error.retryAfterMs);
            throw Worker.RateLimitError();
          }
          if (error instanceof QuotaExceededError) {
            // Pause the whole queue until the budget resets; the job goes back to waiting.
            await queue.rateLimit(Math.max(1000, error.resetAt.getTime() - Date.now()));
            throw Worker.RateLimitError();
          }
          if (error instanceof PermanentProviderError) {
            throw new UnrecoverableError(error.message);
          }
          throw error;
        }
      },
      {
        connection: this.redis.bullConnection(),
        prefix: QUEUE_PREFIX,
        concurrency: limits.concurrency,
        limiter: { max: limits.max, duration: limits.durationMs },
      },
    );

    worker.on('failed', (job, error) => void this.onJobFailed(provider, job, error));
    worker.on('error', (error) =>
      this.logger.warn({ provider, err: errorMessage(error) }, 'Worker connection error'),
    );
    return worker;
  }

  private async onJobFailed(
    provider: ProviderId,
    job: Job<ProviderJobData> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) return;
    const finalAttempt =
      error instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
    this.logger.warn(
      {
        provider,
        movieId: job.data.movieId,
        attempt: job.attemptsMade,
        finalAttempt,
        err: error.message,
      },
      'Provider fetch failed',
    );
    if (!finalAttempt) return;

    Sentry.captureException(error, { tags: { provider }, extra: { movieId: job.data.movieId } });
    const providers: ProviderId[] = [provider, ...(job.data.followUps ?? [])];
    try {
      await this.repository.recordStatus(
        job.data.movieId,
        providers,
        'error',
        error.message.slice(0, 500),
        new Date(),
        {
          countsAsAttempt: true,
        },
      );
      await this.cache.invalidate(job.data.movieId);
    } catch (recordError) {
      this.logger.error({ err: errorMessage(recordError) }, 'Could not record failed fetch');
    }
  }

  private createMaintenanceWorker(): Worker {
    const worker = new Worker<{ onlyIfOlderThanMinutes?: number }>(
      MAINTENANCE_QUEUE,
      async (job) => {
        const name = job.name as MaintenanceJobName;
        switch (name) {
          case 'refresh-ratings':
            return this.scheduler.runRefresh();
          case 'sync-catalog':
            return this.scheduler.syncCatalog(job.data);
          default:
            throw new UnrecoverableError(`Unknown maintenance job: ${job.name}`);
        }
      },
      { connection: this.redis.bullConnection(), prefix: QUEUE_PREFIX, concurrency: 1 },
    );
    worker.on('failed', (job, error) => {
      this.logger.error({ job: job?.name, err: error.message }, 'Maintenance job failed');
      Sentry.captureException(error, { tags: { job: job?.name ?? 'unknown' } });
    });
    worker.on('error', (error) =>
      this.logger.warn({ err: errorMessage(error) }, 'Maintenance worker error'),
    );
    return worker;
  }

  /** Job Schedulers are idempotent upserts, so every worker process can register them safely. */
  private async registerSchedules(): Promise<void> {
    const maintenance = this.queues.maintenance();
    const keep = { removeOnComplete: 20, removeOnFail: 50 };
    await maintenance.upsertJobScheduler(
      'refresh-ratings',
      { every: this.env.SCHEDULER_INTERVAL_MINUTES * 60_000 },
      { name: 'refresh-ratings', opts: keep },
    );
    await maintenance.upsertJobScheduler(
      'sync-catalog',
      { pattern: this.env.CATALOG_SYNC_CRON, tz: 'UTC' },
      { name: 'sync-catalog', data: {}, opts: keep },
    );
    // Fill an empty catalog right away instead of waiting for the first cron tick.
    await maintenance.add(
      'sync-catalog',
      { onlyIfOlderThanMinutes: 60 },
      { ...keep, removeOnComplete: true },
    );
  }
}
