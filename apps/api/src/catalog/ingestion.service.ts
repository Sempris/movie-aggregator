import { Injectable, Logger } from '@nestjs/common';
import type { ProviderId } from '@ratemix/shared';
import type { JobsOptions } from 'bullmq';
import { errorMessage } from '../common/errors';
import { AdapterRegistry } from '../sources/adapter-registry';
import type { JobTrigger } from '../sources/adapter.types';
import type { CachedMovie } from './cached-movie';
import { MovieCacheService } from './movie-cache.service';
import { type ProviderJobData, QueueRegistry } from './queue-registry';
import { RatingsRepository } from './ratings.repository';
import { planFetchOrder, providersNeedingFetch } from './refresh-policy';

/** BullMQ priority: lower runs first. A user waiting on a page beats background work. */
export const JOB_PRIORITY: Readonly<Record<JobTrigger, number>> = {
  on_demand: 1,
  catalog: 5,
  scheduled: 10,
};

const BASE_JOB_OPTIONS: JobsOptions = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 15_000 },
  removeOnComplete: true,
  removeOnFail: { age: 24 * 3600, count: 1000 },
};

/** Enqueues provider fetch jobs. The request path only ever enqueues; workers do the fetching. */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly queues: QueueRegistry,
    private readonly repository: RatingsRepository,
    private readonly registry: AdapterRegistry,
    private readonly cache: MovieCacheService,
  ) {}

  /**
   * Enqueues whatever a title is missing and marks those providers as queued so the UI
   * can show "ratings loading". Returns the providers that were requested.
   */
  async ensureRatings(
    movie: Pick<CachedMovie, 'id' | 'imdbId' | 'detailsFetchedAt' | 'syncs'>,
    trigger: JobTrigger,
    now = new Date(),
  ): Promise<ProviderId[]> {
    const configured = this.registry.configured().map((adapter) => adapter.providerId);
    const needed = providersNeedingFetch(movie, configured, now);
    if (needed.length === 0) return [];

    const { immediate, followUps } = planFetchOrder(needed, movie.imdbId);
    try {
      await this.repository.markQueued(movie.id, needed, now);
      for (const provider of immediate) {
        await this.enqueue(provider, {
          movieId: movie.id,
          trigger,
          ...(provider === 'tmdb' && followUps.length > 0 ? { followUps } : {}),
        });
      }
    } catch (error) {
      // Never fail a page view because Redis/BullMQ is unavailable.
      this.logger.error(
        { movieId: movie.id, err: errorMessage(error) },
        'Failed to enqueue rating fetches',
      );
      await this.repository
        .recordStatus(movie.id, needed, 'error', 'Could not queue fetch', now, {
          countsAsAttempt: false,
        })
        .catch(() => undefined);
    } finally {
      await this.cache.invalidate(movie.id);
    }
    return needed;
  }

  async enqueueFollowUps(
    movieId: string,
    providers: readonly ProviderId[],
    trigger: JobTrigger,
  ): Promise<void> {
    for (const provider of providers) await this.enqueue(provider, { movieId, trigger });
  }

  /** Scheduled refreshes don't mark titles as queued: existing scores stay visible meanwhile. */
  async enqueueScheduled(provider: ProviderId, movieIds: readonly string[]): Promise<number> {
    if (movieIds.length === 0) return 0;
    await this.queues.provider(provider).addBulk(
      movieIds.map((movieId) => ({
        name: 'fetch',
        data: { movieId, trigger: 'scheduled' as const },
        opts: {
          ...BASE_JOB_OPTIONS,
          jobId: jobIdFor(provider, movieId),
          priority: JOB_PRIORITY.scheduled,
        },
      })),
    );
    return movieIds.length;
  }

  private async enqueue(provider: ProviderId, data: ProviderJobData): Promise<void> {
    const queue = this.queues.provider(provider);
    const jobId = jobIdFor(provider, data.movieId);
    const priority = JOB_PRIORITY[data.trigger];

    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed' || state === 'unknown') {
        await existing.remove().catch(() => undefined);
      } else if (state === 'active') {
        // Already running without our follow-ups; enqueue them directly. If the IMDb ID
        // isn't stored yet they record "skipped" and get re-requested once it is.
        if (data.followUps?.length)
          await this.enqueueFollowUps(data.movieId, data.followUps, data.trigger);
        return;
      } else {
        if ((existing.opts.priority ?? 0) > priority) {
          await existing.changePriority({ priority }).catch(() => undefined);
        }
        if (data.followUps?.length) {
          const merged = [...new Set([...(existing.data.followUps ?? []), ...data.followUps])];
          await existing.updateData({ ...existing.data, followUps: merged }).catch(() => undefined);
        }
        return;
      }
    }
    await queue.add('fetch', data, { ...BASE_JOB_OPTIONS, jobId, priority });
  }
}

export function jobIdFor(provider: ProviderId, movieId: string): string {
  return `${provider}-${movieId}`;
}
