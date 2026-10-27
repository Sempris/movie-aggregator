import type { ProviderId } from '@ratemix/shared';
import type { Redis } from 'ioredis';
import type { QuotaScope } from '../common/errors';
import { nextUtcMidnight, utcDayKey } from '../common/time';
import type { JobTrigger } from './adapter.types';

export interface QuotaStore {
  /** Atomically increments `key` if its value is below `cap`; returns the new value or null. */
  incrementIfBelow(key: string, cap: number, ttlSeconds: number): Promise<number | null>;
  get(key: string): Promise<number>;
  set(key: string, value: number, ttlSeconds: number): Promise<void>;
}

const INCREMENT_IF_BELOW = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current >= tonumber(ARGV[1]) then return -1 end
local updated = redis.call('INCR', KEYS[1])
if updated == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return updated
`;

export class RedisQuotaStore implements QuotaStore {
  constructor(private readonly redis: Redis) {}

  async incrementIfBelow(key: string, cap: number, ttlSeconds: number): Promise<number | null> {
    const result = Number(await this.redis.eval(INCREMENT_IF_BELOW, 1, key, cap, ttlSeconds));
    return result < 0 ? null : result;
  }

  async get(key: string): Promise<number> {
    return Number((await this.redis.get(key)) ?? 0);
  }

  async set(key: string, value: number, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }
}

export type QuotaDecision =
  { allowed: true; used: number } | { allowed: false; scope: QuotaScope; resetAt: Date };

/**
 * A per-UTC-day request budget. Background work (scheduled refreshes, catalog
 * prefetch) may only spend `scheduledShare` of it, so users opening a never-seen
 * title still get fresh numbers late in the day.
 */
export class DailyQuota {
  constructor(
    private readonly store: QuotaStore,
    readonly provider: ProviderId,
    readonly dailyLimit: number,
    readonly scheduledShare: number,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  get scheduledDailyBudget(): number {
    return Math.floor(this.dailyLimit * this.scheduledShare);
  }

  async tryConsume(trigger: JobTrigger): Promise<QuotaDecision> {
    const now = this.clock();
    const cap = this.capFor(trigger);
    const used = await this.store.incrementIfBelow(this.key(now), cap, 48 * 3600);
    if (used !== null) return { allowed: true, used };
    return {
      allowed: false,
      scope: cap < this.dailyLimit ? 'scheduled_share' : 'daily_cap',
      resetAt: nextUtcMidnight(now),
    };
  }

  async remaining(trigger: JobTrigger): Promise<number> {
    const used = await this.store.get(this.key(this.clock()));
    return Math.max(0, this.capFor(trigger) - used);
  }

  /** Call when the provider itself reports the limit is reached, so counters match reality. */
  async markExhausted(): Promise<void> {
    await this.store.set(this.key(this.clock()), this.dailyLimit, 48 * 3600);
  }

  resetAt(): Date {
    return nextUtcMidnight(this.clock());
  }

  private capFor(trigger: JobTrigger): number {
    return trigger === 'on_demand' ? this.dailyLimit : this.scheduledDailyBudget;
  }

  private key(now: Date): string {
    return `quota:${this.provider}:${utcDayKey(now)}`;
  }
}
