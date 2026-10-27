<script setup lang="ts">
import type { SourceId } from '@ratemix/shared';
import { computed } from 'vue';
import { channelColor, formatPercent } from '@/lib/format';
import { useSourcesStore } from '@/stores/sources';

const props = defineProps<{ shares: Map<string, number>; enabledCount: number }>();
const sources = useSourcesStore();

const segments = computed(() =>
  sources.sources
    .filter((source) => (props.shares.get(source.id) ?? 0) > 0)
    .map((source) => ({
      id: source.id as SourceId,
      name: source.displayName,
      share: props.shares.get(source.id)!,
    })),
);
</script>

<template>
  <section class="flex flex-col gap-3" aria-label="How your score is made">
    <div class="flex flex-col gap-0.5">
      <h2 class="text-sm font-semibold">How your score is made</h2>
      <p class="text-xs text-ink-2">
        {{ enabledCount }} of {{ sources.sources.length }} sources on
      </p>
    </div>
    <div
      v-if="segments.length"
      class="flex h-3 overflow-hidden rounded-sm bg-well"
      aria-hidden="true"
    >
      <span
        v-for="segment in segments"
        :key="segment.id"
        class="h-full transition-[width] duration-150 not-last:border-r not-last:border-strip"
        :style="{ width: `${segment.share * 100}%`, backgroundColor: channelColor(segment.id) }"
      />
    </div>
    <p v-else class="text-sm text-ink-2">Turn on at least one source to get scores.</p>
    <ul class="flex flex-col gap-1 text-sm">
      <li
        v-for="segment in segments"
        :key="segment.id"
        class="flex items-center justify-between gap-3"
      >
        <span class="flex items-center gap-2">
          <span
            class="size-2 rounded-full"
            :style="{ backgroundColor: channelColor(segment.id) }"
          />
          {{ segment.name }}
        </span>
        <span class="numerals text-base">{{ formatPercent(segment.share) }}</span>
      </li>
    </ul>
  </section>
</template>
