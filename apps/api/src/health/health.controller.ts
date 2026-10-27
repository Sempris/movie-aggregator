import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../core/prisma.service';
import { RedisService } from '../core/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const [database, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(
        () => true,
        () => false,
      ),
      this.redis.ping(),
    ]);
    const healthy = database && redis;
    res.status(healthy ? 200 : 503);
    return {
      status: healthy ? 'ok' : 'degraded',
      checks: { database: database ? 'up' : 'down', redis: redis ? 'up' : 'down' },
    };
  }
}
