import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ENV, type Env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Prisma 7 client using the node-postgres driver adapter (no native query engine).
 * Connections are opened lazily on the first query.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
