import { Inject, Injectable } from '@nestjs/common';
import { PROVIDER_IDS, type ProviderId } from '@ratemix/shared';
import { ENV, type Env } from '../config/env';
import type { RatingSourceAdapter } from './adapter.types';
import { OmdbAdapter } from './omdb/omdb.adapter';
import { DailyQuota } from './quota';
import { TmdbAdapter } from './tmdb/tmdb.adapter';
import { TmdbClient } from './tmdb/tmdb.client';
import { TraktAdapter } from './trakt/trakt.adapter';

export const OMDB_QUOTA = Symbol('OMDB_QUOTA');

/** Holds one adapter per provider. Adding a source means adding an adapter here. */
@Injectable()
export class AdapterRegistry {
  private readonly adapters: ReadonlyMap<ProviderId, RatingSourceAdapter>;

  constructor(
    @Inject(ENV) env: Env,
    tmdbClient: TmdbClient,
    @Inject(OMDB_QUOTA) omdbQuota: DailyQuota,
  ) {
    const adapters: RatingSourceAdapter[] = [
      new TmdbAdapter(tmdbClient),
      new OmdbAdapter(env.OMDB_API_KEY, omdbQuota),
      new TraktAdapter(env.TRAKT_CLIENT_ID),
    ];
    this.adapters = new Map(adapters.map((adapter) => [adapter.providerId, adapter]));
  }

  get(provider: ProviderId): RatingSourceAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new Error(`No adapter registered for provider ${provider}`);
    return adapter;
  }

  all(): RatingSourceAdapter[] {
    return [...this.adapters.values()];
  }

  configured(): RatingSourceAdapter[] {
    return this.all().filter((adapter) => adapter.isConfigured());
  }

  isConfigured(provider: ProviderId): boolean {
    return this.adapters.get(provider)?.isConfigured() ?? false;
  }

  configuredMap(): Record<ProviderId, boolean> {
    return Object.fromEntries(PROVIDER_IDS.map((id) => [id, this.isConfigured(id)])) as Record<
      ProviderId,
      boolean
    >;
  }
}
