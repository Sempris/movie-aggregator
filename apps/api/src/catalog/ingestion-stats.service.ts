import { Injectable } from '@nestjs/common';
import { utcHourKey } from '../common/time';
import { RedisService } from '../core/redis.service';

const KEY = (hour: string) => `ingest:stats:${hour}`;

/** Hourly per-provider outcome counters, logged by the scheduler after each run. */
@Injectable()
export class IngestionStatsService {
  constructor(private readonly redis: RedisService) {}

  async record(provider: string, outcome: string, now = new Date()): Promise<void> {
    const key = KEY(utcHourKey(now));
    try {
      await this.redis.client
        .multi()
        .hincrby(key, `${provider}:${outcome}`, 1)
        .expire(key, 48 * 3600)
        .exec();
    } catch {
      // metrics are best-effort
    }
  }

  async summaryForHour(date: Date): Promise<Record<string, Record<string, number>>> {
    const raw = await this.redis.client.hgetall(KEY(utcHourKey(date))).catch(() => ({}));
    const summary: Record<string, Record<string, number>> = {};
    for (const [field, value] of Object.entries(raw as Record<string, string>)) {
      const [provider, outcome] = field.split(':');
      if (!provider || !outcome) continue;
      (summary[provider] ??= {})[outcome] = Number(value);
    }
    return summary;
  }
}
