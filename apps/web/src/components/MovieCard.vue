<script setup lang="ts">
import type { MovieSummaryDto } from '@ratemix/shared';
import { computed } from 'vue';
import { useCompositeScore } from '@/composables/useCompositeScore';
import { channelColor } from '@/lib/format';
import { useSourcePreferencesStore } from '@/stores/sourcePreferences';
import { useSourcesStore } from '@/stores/sources';
import ScoreBadge from './ScoreBadge.vue';

const props = defineProps<{ movie: MovieSummaryDto }>();
const composite = useCompositeScore(() => props.movie);
const sources = useSourcesStore();
const preferences = useSourcePreferencesStore();

const channels = computed(() =>
  sources.sources.map((source) => ({
    id: source.id,
    name: source.displayName,
    rated: props.movie.ratings.some((rating) => rating.sourceId === source.id),
    enabled: preferences.resolved[source.id]?.enabled ?? false,
  })),
);
const coverage = computed(() => {
  const used = composite.value?.contributions.length ?? 0;
  return `Based on ${used} of ${channels.value.filter((channel) => channel.enabled).length} sources you have on`;
});
</script>

<template>
  <RouterLink
    :to="{ name: 'movie', params: { tmdbId: movie.tmdbId } }"
    class="group flex w-full flex-col gap-2 rounded-sm focus-visible:outline-offset-4"
  >
    <div class="relative aspect-[2/3] overflow-hidden rounded-sm bg-well">
      <img
        v-if="movie.posterUrl"
        :src="movie.posterUrl"
        :alt="''"
        loading="lazy"
        class="size-full object-cover transition-[filter] duration-200 group-hover:brightness-105"
      />
      <span
        v-else
        class="absolute inset-0 grid place-items-center p-3 text-center text-sm text-ink-2"
        >No poster</span
      >
      <ScoreBadge
        class="absolute bottom-2 left-2"
        :score="composite?.score ?? null"
        :pending="movie.ratingsPending"
      />
    </div>
    <div class="flex items-start justify-between gap-2">
      <p
        class="text-sm leading-snug font-semibold group-hover:underline group-hover:underline-offset-2"
      >
        {{ movie.title }}
        <span v-if="movie.releaseYear" class="font-normal text-ink-2"
          >({{ movie.releaseYear }})</span
        >
      </p>
      <span class="mt-1 flex shrink-0 gap-1" role="img" :aria-label="coverage">
        <span
          v-for="channel in channels"
          :key="channel.id"
          class="size-1.5 rounded-full"
          :style="{
            backgroundColor:
              channel.rated && channel.enabled ? channelColor(channel.id) : 'transparent',
            boxShadow: `inset 0 0 0 1px ${channel.rated ? channelColor(channel.id) : 'var(--color-seam)'}`,
          }"
        />
      </span>
    </div>
  </RouterLink>
</template>
