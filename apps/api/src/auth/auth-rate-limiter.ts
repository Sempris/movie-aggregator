import { Injectable, Logger } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { createHash } from 'node:crypto';
import { errorMessage } from '../common/errors';
import { RedisService } from '../core/redis.service';

/** Fixed-window limiter for credential endpoints. Fails open if Redis is unavailable. */
@Injectable()
export class AuthRateLimiter {
  private readonly logger = new Logger(AuthRateLimiter.name);

  constructor(private readonly redis: RedisService) {}

  async consume(
    action: string,
    identity: string,
    limit: number,
    windowSeconds: number,
  ): Promise<void> {
    const digest = createHash('sha256').update(identity).digest('base64url').slice(0, 32);
    const key = `ratelimit:${action}:${digest}`;
    let count: number;
    try {
      count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, windowSeconds);
    } catch (error) {
      this.logger.warn(
        { action, err: errorMessage(error) },
        'Rate limiter unavailable; allowing request',
      );
      return;
    }
    if (count > limit) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many attempts. Wait a few minutes and try again.',
      });
    }
  }
}
