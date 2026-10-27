<script setup lang="ts">
import type { MovieDetailDto } from '@ratemix/shared';
import { computed } from 'vue';
import { channelColor, formatVotes, relativeTime } from '@/lib/format';
import { useSourcePreferencesStore } from '@/stores/sourcePreferences';
import { useSourcesStore } from '@/stores/sources';

const props = defineProps<{ movie: MovieDetailDto }>();
const sources = useSourcesStore();
const preferences = useSourcePreferencesStore();

const rows = computed(() =>
  sources.sources.map((source) => {
    const rating = props.movie.ratings.find((entry) => entry.sourceId === source.id) ?? null;
    const provider = props.movie.providers.find((entry) => entry.provider === source.provider);
    let note: string | null = null;
    if (!rating) {
      if (provider?.status === 'queued') note = 'Fetching now';
      else note = provider?.message ?? 'No score for this title';
    }
    return {
      source,
      rating,
      note,
      enabled: preferences.resolved[source.id]?.enabled ?? false,
      updated: rating ? relativeTime(rating.fetchedAt) : null,
    };
  }),
);
</script>

<template>
  <section class="flex flex-col gap-3" aria-labelledby="source-details-heading">
    <h2 id="source-details-heading" class="display-condensed text-2xl">
      Where the numbers come from
    </h2>
    <p class="max-w-prose text-sm text-ink-2">
      Each source keeps its own scale. RateMix converts every score to 0–100 before mixing, so a
      7.8/10 counts as 78. Rotten Tomatoes measures how many critics liked a film, not how much.
    </p>
    <div class="overflow-x-auto rounded-md border border-seam bg-strip">
      <table class="w-full min-w-[22rem] text-left text-sm">
        <thead class="text-xs text-ink-2">
          <tr class="border-b border-seam">
            <th scope="col" class="px-4 py-2 font-medium">Source</th>
            <th scope="col" class="px-4 py-2 font-medium">Their score</th>
            <th scope="col" class="px-4 py-2 font-medium">On 0–100</th>
            <th scope="col" class="px-4 py-2 font-medium">Details</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-seam">
          <tr v-for="row in rows" :key="row.source.id" :class="row.enabled ? '' : 'text-ink-2'">
            <th scope="row" class="px-4 py-3 font-semibold">
              <span class="flex items-center gap-2">
                <span
                  class="size-2 rounded-full"
                  :style="{ backgroundColor: channelColor(row.source.id) }"
                />
                <span>
                  {{ row.source.displayName }}
                  <span v-if="row.source.deliveredVia" class="block text-xs font-normal text-ink-2">
                    Delivered by {{ row.source.deliveredVia }}
                  </span>
                </span>
              </span>
            </th>
            <td class="numerals px-4 py-3 text-lg">{{ row.rating?.rawDisplay ?? '–' }}</td>
            <td class="px-4 py-3">
              <span v-if="row.rating" class="flex items-center gap-2">
                <span class="numerals w-8 text-lg">{{
                  Math.round(row.rating.normalizedValue)
                }}</span>
                <span
                  class="relative hidden h-1 w-24 overflow-hidden rounded-full bg-well sm:block"
                  aria-hidden="true"
                >
                  <span
                    class="absolute inset-y-0 left-0"
                    :style="{
                      width: `${row.rating.normalizedValue}%`,
                      backgroundColor: channelColor(row.source.id),
                    }"
                  />
                </span>
              </span>
              <span v-else>–</span>
            </td>
            <td class="px-4 py-3 text-ink-2">
              <template v-if="row.rating">
                {{
                  [formatVotes(row.rating.voteCount), row.updated ? `updated ${row.updated}` : null]
                    .filter(Boolean)
                    .join(', ')
                }}
              </template>
              <template v-else>{{ row.note }}</template>
              <span v-if="!row.enabled" class="block text-xs">Off in your mix</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
