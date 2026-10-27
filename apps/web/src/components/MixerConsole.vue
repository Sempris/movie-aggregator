<script setup lang="ts">
import type { SourceRatingDto } from '@ratemix/shared';
import { computed } from 'vue';
import { useCompositeScore } from '@/composables/useCompositeScore';
import { useSourcePreferencesStore } from '@/stores/sourcePreferences';
import { useSourcesStore } from '@/stores/sources';
import ChannelStrip from './ChannelStrip.vue';
import MasterReadout from './MasterReadout.vue';
import MixSummary from './MixSummary.vue';

const props = withDefaults(
  defineProps<{
    /** Title whose scores the channels show. Omit for a title-less mixer (settings). */
    movie?: { ratings: SourceRatingDto[]; ratingsPending: boolean } | null;
    layout?: 'console' | 'rows';
    sweepIn?: boolean;
  }>(),
  { movie: undefined, layout: 'console', sweepIn: false },
);

const sources = useSourcesStore();
const preferences = useSourcePreferencesStore();
const composite = useCompositeScore(() => props.movie);
const hasTitle = computed(() => props.movie !== undefined && props.movie !== null);

/** Without a title, share reflects weights alone so the faders still explain themselves. */
const shares = computed(() => {
  const result = new Map<string, number>();
  if (hasTitle.value) {
    for (const contribution of composite.value?.contributions ?? [])
      result.set(contribution.sourceId, contribution.share);
    return result;
  }
  const enabled = sources.sources.filter((source) => preferences.resolved[source.id]?.enabled);
  const total = enabled.reduce(
    (sum, source) => sum + (preferences.resolved[source.id]?.weight ?? 0),
    0,
  );
  for (const source of enabled)
    result.set(source.id, (preferences.resolved[source.id]?.weight ?? 0) / (total || 1));
  return result;
});

function ratingFor(sourceId: string) {
  if (!hasTitle.value) return undefined;
  return props.movie?.ratings.find((rating) => rating.sourceId === sourceId) ?? null;
}
</script>

<template>
  <div
    class="overflow-hidden rounded-md border border-seam bg-strip"
    :class="layout === 'console' ? 'grid lg:grid-cols-[minmax(0,1fr)_17rem]' : 'flex flex-col'"
  >
    <div
      role="group"
      aria-label="Rating sources"
      :class="
        layout === 'console'
          ? 'grid grid-cols-1 divide-y divide-seam sm:grid-cols-5 sm:divide-x sm:divide-y-0'
          : 'flex flex-col divide-y divide-seam'
      "
    >
      <template v-for="source in sources.sources" :key="source.id">
        <!-- Vertical faders from the sm breakpoint up in console layout, rows otherwise. -->
        <ChannelStrip
          v-if="layout === 'console'"
          class="hidden sm:flex"
          orientation="vertical"
          :source="source"
          :preference="preferences.resolved[source.id]!"
          :rating="ratingFor(source.id)"
          :share="shares.get(source.id) ?? null"
          :pending="movie?.ratingsPending"
          @update:enabled="(value) => preferences.setEnabled(source.id, value)"
          @update:weight="(value) => preferences.setWeight(source.id, value)"
        />
        <ChannelStrip
          :class="layout === 'console' ? 'sm:hidden' : ''"
          orientation="horizontal"
          :source="source"
          :preference="preferences.resolved[source.id]!"
          :rating="ratingFor(source.id)"
          :share="shares.get(source.id) ?? null"
          :pending="movie?.ratingsPending"
          @update:enabled="(value) => preferences.setEnabled(source.id, value)"
          @update:weight="(value) => preferences.setWeight(source.id, value)"
        />
      </template>
    </div>

    <div
      class="flex flex-col gap-4 border-seam p-4"
      :class="layout === 'console' ? 'border-t lg:border-t-0 lg:border-l' : 'border-t'"
    >
      <MixSummary v-if="!hasTitle" :shares="shares" :enabled-count="preferences.enabledCount" />
      <MasterReadout
        v-else
        :composite="composite"
        :enabled-count="preferences.enabledCount"
        :source-count="sources.sources.length"
        :pending="movie?.ratingsPending"
        :sweep-in="sweepIn"
        :size="layout === 'rows' ? 'small' : 'large'"
      />
      <button
        v-if="preferences.customized"
        type="button"
        class="self-start text-sm font-medium text-ink-2 underline decoration-seam underline-offset-4 hover:text-ink hover:decoration-ink"
        @click="preferences.reset()"
      >
        Reset: all sources on, equal weight
      </button>
      <p v-else class="text-sm text-ink-2">
        Every source counts equally. Move a fader to change that.
      </p>
    </div>
  </div>
</template>
