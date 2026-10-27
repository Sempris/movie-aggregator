import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env';

/**
 * Shared Redis client for caching, counters and rate limiting. BullMQ creates its
 * own connections from `bullConnection()` because workers need blocking clients.
 *
 * The Redis instance must use `maxmemory-policy noeviction` (a BullMQ requirement),
 * so cache keys carry a long safety TTL even though freshness comes from explicit
 * invalidation on ingestion writes.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);
  private lastErrorLoggedAt = 0;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectionName: 'ratemix-app',
    });
    this.client.on('error', (error: Error) => {
      // Avoid flooding logs while Redis is unreachable.
      if (Date.now() - this.lastErrorLoggedAt > 30_000) {
        this.lastErrorLoggedAt = Date.now();
        this.logger.warn({ err: error.message }, 'Redis connection error');
      }
    });
  }

  bullConnection(): ConnectionOptions {
    return { url: this.env.REDIS_URL, maxRetriesPerRequest: null };
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'ready' || this.client.status === 'connecting') {
      await this.client.quit().catch(() => undefined);
    } else {
      this.client.disconnect();
    }
  }
}
