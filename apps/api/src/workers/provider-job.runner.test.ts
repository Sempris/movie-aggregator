import { describe, expect, it, vi } from 'vitest';
import { QuotaExceededError } from '../common/errors';
import type { AdapterResult, RatingSourceAdapter } from '../sources/adapter.types';
import { ProviderJobRunner } from './provider-job.runner';

const now = new Date('2026-09-10T12:00:00Z');

function setup(adapterBehaviour: () => Promise<AdapterResult>) {
  const adapter: RatingSourceAdapter = {
    providerId: 'tmdb',
    sourceIds: ['tmdb'],
    isConfigured: () => true,
    fetchRatings: vi.fn(adapterBehaviour),
  };
  const registry = { get: vi.fn(() => adapter) };
  const repository = {
    getMovieRef: vi.fn(async () => ({
      id: 'm1',
      tmdbId: 1,
      imdbId: null,
      title: 'T',
      releaseYear: 2020,
    })),
    applyAdapterResult: vi.fn(async () => undefined),
    recordStatus: vi.fn(async () => undefined),
  };
  const cache = { invalidate: vi.fn(async () => undefined) };
  const ingestion = { enqueueFollowUps: vi.fn(async () => undefined) };
  const stats = { record: vi.fn(async () => undefined) };
  const runner = new ProviderJobRunner(
    registry as never,
    repository as never,
    cache as never,
    ingestion as never,
    stats as never,
  );
  return { runner, adapter, repository, cache, ingestion, stats };
}

describe('ProviderJobRunner', () => {
  it('persists results, invalidates the cache and enqueues follow-ups after TMDB succeeds', async () => {
    const result: AdapterResult = { status: 'ok', ratings: {}, metadata: { imdbId: 'tt1' } };
    const { runner, repository, cache, ingestion } = setup(async () => result);
    const outcome = await runner.run(
      'tmdb',
      { movieId: 'm1', trigger: 'on_demand', followUps: ['omdb', 'trakt'] },
      now,
    );
    expect(outcome).toBe('ok');
    expect(repository.applyAdapterResult).toHaveBeenCalledWith('m1', 'tmdb', ['tmdb'], result, now);
    expect(cache.invalidate).toHaveBeenCalledWith('m1');
    expect(ingestion.enqueueFollowUps).toHaveBeenCalledWith('m1', ['omdb', 'trakt'], 'on_demand');
  });

  it('marks follow-ups skipped when TMDB does not know the title', async () => {
    const { runner, repository, ingestion } = setup(async () => ({ status: 'not_found' }));
    await runner.run('tmdb', { movieId: 'm1', trigger: 'on_demand', followUps: ['omdb'] }, now);
    expect(ingestion.enqueueFollowUps).not.toHaveBeenCalled();
    expect(repository.recordStatus).toHaveBeenCalledWith(
      'm1',
      ['omdb'],
      'skipped',
      'Title not found on TMDB',
      now,
      {
        countsAsAttempt: true,
      },
    );
  });

  it('drops scheduled work quietly when the background budget is spent', async () => {
    const { runner, repository } = setup(async () => {
      throw new QuotaExceededError('omdb', 'scheduled_share', new Date('2026-09-11T00:00:00Z'));
    });
    expect(await runner.run('tmdb', { movieId: 'm1', trigger: 'scheduled' }, now)).toBe('deferred');
    expect(repository.recordStatus).not.toHaveBeenCalled();
  });

  it('records a deferral and rethrows when the daily cap blocks an on-demand fetch', async () => {
    const { runner, repository } = setup(async () => {
      throw new QuotaExceededError('omdb', 'daily_cap', new Date('2026-09-11T00:00:00Z'));
    });
    await expect(
      runner.run('tmdb', { movieId: 'm1', trigger: 'on_demand' }, now),
    ).rejects.toBeInstanceOf(QuotaExceededError);
    expect(repository.recordStatus).toHaveBeenCalledWith(
      'm1',
      ['tmdb'],
      'deferred',
      expect.stringContaining('Daily request limit reached'),
      now,
      { countsAsAttempt: false },
    );
  });

  it('does nothing for titles that were deleted meanwhile', async () => {
    const { runner, repository, adapter } = setup(async () => ({ status: 'ok', ratings: {} }));
    repository.getMovieRef.mockResolvedValueOnce(null as never);
    expect(await runner.run('tmdb', { movieId: 'gone', trigger: 'scheduled' }, now)).toBe(
      'movie_missing',
    );
    expect(adapter.fetchRatings).not.toHaveBeenCalled();
  });
});
