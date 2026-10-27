import { Injectable } from '@nestjs/common';
import {
  type PreferenceMap,
  type PreferenceOverrides,
  type PreferencesDto,
  type SetAllPreferencesInput,
  type UpdatePreferenceInput,
  isSourceId,
  resolvePreferences,
} from '@ratemix/shared';
import { SourcesService } from '../catalog/sources.service';
import { PrismaService } from '../core/prisma.service';
import type { PreferencesApi } from '../trpc/deps';

@Injectable()
export class PreferencesService implements PreferencesApi {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: SourcesService,
  ) {}

  async get(userId: string): Promise<PreferencesDto> {
    const [defaults, rows] = await Promise.all([
      this.sources.defaults(),
      this.prisma.userSourcePreference.findMany({ where: { userId } }),
    ]);
    const resolved = resolvePreferences(defaults, this.overridesFrom(rows));
    const updatedAt = rows.reduce<Date | null>(
      (latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest),
      null,
    );
    return {
      preferences: defaults.map(({ id }) => ({ sourceId: id, ...resolved[id]! })),
      customized: rows.length > 0,
      updatedAt: updatedAt?.toISOString() ?? null,
    };
  }

  async update(userId: string, input: UpdatePreferenceInput): Promise<PreferencesDto> {
    const defaults = await this.sources.defaults();
    const fallbackWeight =
      defaults.find((source) => source.id === input.sourceId)?.defaultWeight ?? 1;
    await this.prisma.userSourcePreference.upsert({
      where: { userId_sourceId: { userId, sourceId: input.sourceId } },
      create: {
        userId,
        sourceId: input.sourceId,
        enabled: input.enabled ?? true,
        weight: input.weight ?? fallbackWeight,
      },
      update: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.weight !== undefined ? { weight: input.weight } : {}),
      },
    });
    return this.get(userId);
  }

  async setAll(userId: string, input: SetAllPreferencesInput): Promise<PreferencesDto> {
    const known = new Set((await this.sources.defaults()).map((source) => source.id));
    await this.prisma.$transaction(
      input.preferences
        .filter((preference) => known.has(preference.sourceId))
        .map(({ sourceId, enabled, weight }) =>
          this.prisma.userSourcePreference.upsert({
            where: { userId_sourceId: { userId, sourceId } },
            create: { userId, sourceId, enabled, weight },
            update: { enabled, weight },
          }),
        ),
    );
    return this.get(userId);
  }

  async reset(userId: string): Promise<PreferencesDto> {
    await this.prisma.userSourcePreference.deleteMany({ where: { userId } });
    return this.get(userId);
  }

  /** Resolved preferences for composite scoring; guests get catalog defaults. */
  async resolveFor(userId: string | null): Promise<PreferenceMap> {
    const defaults = await this.sources.defaults();
    if (!userId) return resolvePreferences(defaults, undefined);
    const rows = await this.prisma.userSourcePreference.findMany({ where: { userId } });
    return resolvePreferences(defaults, this.overridesFrom(rows));
  }

  private overridesFrom(
    rows: Array<{ sourceId: string; enabled: boolean; weight: number }>,
  ): PreferenceOverrides {
    const overrides: PreferenceOverrides = {};
    for (const row of rows) {
      if (isSourceId(row.sourceId))
        overrides[row.sourceId] = { enabled: row.enabled, weight: row.weight };
    }
    return overrides;
  }
}
