import { Injectable, Logger } from '@nestjs/common';
import type { ProviderId } from '@ratemix/shared';
import { QuotaExceededError } from '../common/errors';
import { IngestionStatsService } from '../catalog/ingestion-stats.service';
import { IngestionService } from '../catalog/ingestion.service';
import { MovieCacheService } from '../catalog/movie-cache.service';
import type { ProviderJobData } from '../catalog/queue-registry';
import { RatingsRepository } from '../catalog/ratings.repository';
import { AdapterRegistry } from '../sources/adapter-registry';

export type ProviderJobOutcome = 'ok' | 'not_found' | 'skipped' | 'deferred' | 'movie_missing';

/**
 * Executes one provider fetch for one title: adapter call, persistence, cache
 * invalidation and follow-up scheduling. Queue mechanics (retries, rate-limit
 * pauses) live in WorkersService so this stays testable without Redis.
 */
@Injectable()
export class ProviderJobRunner {
  private readonly logger = new Logger(ProviderJobRunner.name);

  constructor(
    private readonly registry: AdapterRegistry,
    private readonly repository: RatingsRepository,
    private readonly cache: MovieCacheService,
    private readonly ingestion: IngestionService,
    private readonly stats: IngestionStatsService,
  ) {}

  async run(
    provider: ProviderId,
    data: ProviderJobData,
    now = new Date(),
  ): Promise<ProviderJobOutcome> {
    const started = Date.now();
    const adapter = this.registry.get(provider);

    if (!adapter.isConfigured()) {
      await this.repository.recordStatus(
        data.movieId,
        [provider],
        'skipped',
        'Provider is not configured',
        now,
        {
          countsAsAttempt: true,
        },
      );
      await this.cache.invalidate(data.movieId);
      return this.finish(provider, data, 'skipped', started);
    }

    const movie = await this.repository.getMovieRef(data.movieId);
    if (!movie) return this.finish(provider, data, 'movie_missing', started);

    let result;
    try {
      result = await adapter.fetchRatings(movie, { trigger: data.trigger });
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        await this.stats.record(provider, 'deferred', now);
        if (error.scope === 'scheduled_share') {
          // Leave sync state untouched; the scheduler picks the title up again later.
          return this.finish(provider, data, 'deferred', started);
        }
        await this.repository.recordStatus(
          data.movieId,
          [provider],
          'deferred',
          `Daily request limit reached; retrying after ${error.resetAt.toISOString()}`,
          now,
          { countsAsAttempt: false },
        );
        await this.cache.invalidate(data.movieId);
      }
      throw error;
    }

    await this.repository.applyAdapterResult(
      data.movieId,
      provider,
      adapter.sourceIds,
      result,
      now,
    );

    const followUps = data.followUps ?? [];
    if (followUps.length > 0) {
      if (result.status === 'ok') {
        await this.ingestion.enqueueFollowUps(data.movieId, followUps, data.trigger);
      } else {
        const reason = result.status === 'not_found' ? 'Title not found on TMDB' : result.message;
        await this.repository.recordStatus(
          data.movieId,
          followUps,
          'skipped',
          reason ?? null,
          now,
          {
            countsAsAttempt: true,
          },
        );
      }
    }

    await this.cache.invalidate(data.movieId);
    await this.stats.record(provider, result.status, now);
    return this.finish(provider, data, result.status, started);
  }

  private finish(
    provider: ProviderId,
    data: ProviderJobData,
    outcome: ProviderJobOutcome,
    started: number,
  ): ProviderJobOutcome {
    this.logger.log(
      {
        provider,
        movieId: data.movieId,
        trigger: data.trigger,
        outcome,
        durationMs: Date.now() - started,
      },
      'Provider fetch finished',
    );
    return outcome;
  }
}
