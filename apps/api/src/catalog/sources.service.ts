import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  PROVIDERS,
  type RatingSourceDto,
  type RawScoreFormat,
  SOURCE_CATALOG,
  type SourceDefaults,
  type SourceDefinition,
  deliveredVia,
  isProviderId,
  isSourceId,
} from '@ratemix/shared';
import { errorMessage } from '../common/errors';
import { PrismaService } from '../core/prisma.service';
import { AdapterRegistry } from '../sources/adapter-registry';

const CACHE_MS = 60_000;

/** Rating sources as stored in `rating_sources`, seeded from the shared catalog. */
@Injectable()
export class SourcesService implements OnModuleInit {
  private readonly logger = new Logger(SourcesService.name);
  private cache: { expiresAt: number; rows: SourceDefinition[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AdapterRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureCatalog();
    } catch (error) {
      this.logger.warn(
        { err: errorMessage(error) },
        'Could not sync rating_sources (has `pnpm db:migrate` run?); will fall back to the built-in catalog',
      );
    }
  }

  /** Inserts new sources and refreshes descriptive fields; admin-tuned default weights are kept. */
  async ensureCatalog(): Promise<void> {
    await this.prisma.$transaction(
      SOURCE_CATALOG.map((source) =>
        this.prisma.ratingSource.upsert({
          where: { id: source.id },
          create: { ...source },
          update: {
            displayName: source.displayName,
            provider: source.provider,
            description: source.description,
            scaleMin: source.scaleMin,
            scaleMax: source.scaleMax,
            rawFormat: source.rawFormat,
            sortOrder: source.sortOrder,
          },
        }),
      ),
    );
    this.cache = null;
  }

  async definitions(): Promise<SourceDefinition[]> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.rows;
    let rows: SourceDefinition[];
    try {
      const records = await this.prisma.ratingSource.findMany({ orderBy: { sortOrder: 'asc' } });
      rows = records.flatMap((record) =>
        isSourceId(record.id) && isProviderId(record.provider)
          ? [
              {
                id: record.id,
                displayName: record.displayName,
                provider: record.provider,
                description: record.description,
                scaleMin: record.scaleMin,
                scaleMax: record.scaleMax,
                rawFormat: record.rawFormat as RawScoreFormat,
                defaultWeight: record.defaultWeight,
                sortOrder: record.sortOrder,
              },
            ]
          : [],
      );
    } catch (error) {
      this.logger.warn(
        { err: errorMessage(error) },
        'Reading rating_sources failed; using built-in catalog',
      );
      rows = [];
    }
    if (rows.length === 0) rows = [...SOURCE_CATALOG];
    this.cache = { expiresAt: Date.now() + CACHE_MS, rows };
    return rows;
  }

  async defaults(): Promise<SourceDefaults[]> {
    return (await this.definitions()).map(({ id, defaultWeight }) => ({ id, defaultWeight }));
  }

  async list(): Promise<RatingSourceDto[]> {
    return (await this.definitions()).map((source) => ({
      ...source,
      providerDisplayName: PROVIDERS[source.provider].displayName,
      deliveredVia: deliveredVia(source),
      available: this.registry.isConfigured(source.provider),
    }));
  }
}
