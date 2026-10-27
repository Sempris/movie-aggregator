import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { ProviderId } from '@ratemix/shared';
import { Queue } from 'bullmq';
import { errorMessage } from '../common/errors';
import { RedisService } from '../core/redis.service';
import type { JobTrigger } from '../sources/adapter.types';

export const QUEUE_PREFIX = 'ratemix';
export const MAINTENANCE_QUEUE = 'maintenance';

export function providerQueueName(provider: ProviderId): string {
  return `ratings-${provider}`;
}

export interface ProviderJobData {
  movieId: string;
  trigger: JobTrigger;
  /** Providers to enqueue once this (TMDB) job has stored the IMDb ID. */
  followUps?: ProviderId[];
}

export type MaintenanceJobName = 'refresh-ratings' | 'sync-catalog';

/** Lazily creates BullMQ queues so processes only open the connections they use. */
@Injectable()
export class QueueRegistry implements OnModuleDestroy {
  private readonly logger = new Logger(QueueRegistry.name);
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly redis: RedisService) {}

  provider(provider: ProviderId): Queue<ProviderJobData> {
    return this.get(providerQueueName(provider)) as Queue<ProviderJobData>;
  }

  maintenance(): Queue<{ onlyIfOlderThanMinutes?: number }> {
    return this.get(MAINTENANCE_QUEUE) as Queue<{ onlyIfOlderThanMinutes?: number }>;
  }

  private get(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.redis.bullConnection(), prefix: QUEUE_PREFIX });
      queue.on('error', (error: Error) =>
        this.logger.warn({ queue: name, err: errorMessage(error) }, 'Queue connection error'),
      );
      this.queues.set(name, queue);
    }
    return queue;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.queues.values()].map((queue) => queue.close()));
  }
}
