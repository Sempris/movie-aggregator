import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ProviderId } from '@ratemix/shared';
import { IngestionStatsService } from '../catalog/ingestion-stats.service';
import { IngestionService } from '../catalog/ingestion.service';
import { MovieCacheService } from '../catalog/movie-cache.service';
import { type CatalogList, RatingsRepository } from '../catalog/ratings.repository';
import {
  type RefreshIntervals,
  STALE_QUEUED_MS,
  selectDueForRefresh,
} from '../catalog/refresh-policy';
import { errorMessage } from '../common/errors';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../common/time';
import { ENV, type Env } from '../config/env';
import { AdapterRegistry, OMDB_QUOTA } from '../sources/adapter-registry';
import type { DailyQuota } from '../sources/quota';
import { TmdbClient, type TmdbMovieSummary } from '../sources/tmdb/tmdb.client';

/** Upper bound of scheduled jobs per provider per run for providers without a daily quota. */
const DEFAULT_PER_RUN_CAP = 300;
/** Titles viewed within this window stay on the refresh schedule. */
const ACTIVE_VIEW_WINDOW_MS = 30 * DAY_MS;

export interface RefreshRunSummary {
  [provider: string]: { candidates: number; enqueued: number; cap: number };
}

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly repository: RatingsRepository,
    private readonly registry: AdapterRegistry,
    private readonly ingestion: IngestionService,
    private readonly cache: MovieCacheService,
    private readonly stats: IngestionStatsService,
    private readonly tmdb: TmdbClient,
    @Inject(OMDB_QUOTA) private readonly omdbQuota: DailyQuota,
  ) {}

  /**
   * Walks the catalog per provider and enqueues titles whose refresh interval has
   * elapsed. OMDb's scheduled budget is spread evenly across the day's runs, which
   * makes the 1,000/day free tier the thing that paces the whole schedule.
   */
  async runRefresh(now = new Date()): Promise<RefreshRunSummary> {
    const intervals: RefreshIntervals = {
      hotHours: this.env.REFRESH_HOURS_HOT,
      recentHours: this.env.REFRESH_HOURS_RECENT,
      stableHours: this.env.REFRESH_HOURS_STABLE,
    };
    const summary: RefreshRunSummary = {};

    for (const adapter of this.registry.configured()) {
      const provider = adapter.providerId;
      const cap = await this.perRunCap(provider);
      if (cap <= 0) {
        summary[provider] = { candidates: 0, enqueued: 0, cap };
        continue;
      }
      const candidates = await this.repository.findRefreshCandidates({
        provider,
        attemptCutoff: new Date(now.getTime() - intervals.hotHours * HOUR_MS),
        viewedSince: new Date(now.getTime() - ACTIVE_VIEW_WINDOW_MS),
        staleQueuedCutoff: new Date(now.getTime() - STALE_QUEUED_MS),
        requireImdbId: provider === 'omdb',
        limit: cap * 4,
      });
      const due = selectDueForRefresh(candidates, intervals, now).slice(0, cap);
      const enqueued = await this.ingestion.enqueueScheduled(
        provider,
        due.map((candidate) => candidate.id),
      );
      summary[provider] = { candidates: candidates.length, enqueued, cap };
    }

    const previousHour = await this.stats.summaryForHour(new Date(now.getTime() - HOUR_MS));
    this.logger.log(
      { scheduled: summary, previousHourOutcomes: previousHour },
      'Refresh run complete',
    );
    return summary;
  }

  /** Pulls TMDB trending and popular lists into the catalog and requests missing ratings. */
  async syncCatalog(
    options: { onlyIfOlderThanMinutes?: number } = {},
    now = new Date(),
  ): Promise<void> {
    if (!this.tmdb.isConfigured()) {
      this.logger.warn('Skipping catalog sync: TMDB_API_KEY is not configured');
      return;
    }
    if (options.onlyIfOlderThanMinutes) {
      const { syncedAt } = await this.repository.getList('trending');
      if (
        syncedAt &&
        now.getTime() - syncedAt.getTime() < options.onlyIfOlderThanMinutes * MINUTE_MS
      ) {
        return;
      }
    }

    const [trending, popular] = await Promise.all([
      this.tmdb.trending('day'),
      this.tmdb.popular(1),
    ]);
    const lists: Array<[CatalogList, TmdbMovieSummary[]]> = [
      ['trending', trending],
      ['popular', popular],
    ];
    const touched = new Set<string>();
    for (const [list, movies] of lists) {
      const ids = await this.repository.upsertFromTmdbSummaries(movies, now);
      await this.repository.replaceList(list, ids, now);
      ids.forEach((id) => touched.add(id));
    }
    await this.cache.invalidate([...touched]);

    let requested = 0;
    const snapshots = await this.cache.getMany([...touched]);
    for (const movie of snapshots.values()) {
      try {
        if ((await this.ingestion.ensureRatings(movie, 'catalog', now)).length > 0) requested += 1;
      } catch (error) {
        this.logger.warn(
          { movieId: movie.id, err: errorMessage(error) },
          'Could not request catalog ratings',
        );
      }
    }
    this.logger.log(
      { trending: trending.length, popular: popular.length, titlesNeedingRatings: requested },
      'Catalog sync complete',
    );
  }

  private async perRunCap(provider: ProviderId): Promise<number> {
    if (provider !== 'omdb') return DEFAULT_PER_RUN_CAP;
    const runsPerDay = Math.max(1, Math.floor((24 * 60) / this.env.SCHEDULER_INTERVAL_MINUTES));
    const evenShare = Math.ceil(this.omdbQuota.scheduledDailyBudget / runsPerDay);
    return Math.min(evenShare, await this.omdbQuota.remaining('scheduled'));
  }
}
