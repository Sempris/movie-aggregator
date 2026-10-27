<script setup lang="ts">
import type { CompositeScore } from '@ratemix/shared';
import { computed } from 'vue';
import { useTweenedNumber } from '@/composables/useTweenedNumber';
import { formatScore } from '@/lib/format';

const props = defineProps<{
  composite: CompositeScore | null;
  enabledCount: number;
  sourceCount: number;
  pending?: boolean;
  sweepIn?: boolean;
  size?: 'large' | 'small';
}>();

const SEGMENTS = 20;
const target = computed(() => props.composite?.score ?? null);
const shown = useTweenedNumber(target, { sweepIn: props.sweepIn });
const litSegments = computed(() => Math.round(((shown.value ?? 0) / 100) * SEGMENTS));

const caption = computed(() => {
  const used = props.composite?.contributions.length ?? 0;
  if (used === 0) {
    if (props.pending) return 'Collecting scores';
    return props.enabledCount === 0
      ? 'Turn on a source to get a score'
      : 'None of your sources rate this title yet';
  }
  return used === 1 ? 'From 1 source' : `From ${used} sources`;
});
</script>

<template>
  <section class="flex flex-col gap-3" aria-label="Your score">
    <div class="flex items-baseline justify-between gap-4">
      <h2 class="text-sm font-semibold">Your score</h2>
      <p class="text-xs text-ink-2" data-testid="your-score-caption">{{ caption }}</p>
    </div>
    <div class="rounded-md bg-display px-4 pt-3 pb-4 shadow-[inset_0_2px_6px_rgb(0_0_0/0.45)]">
      <p
        class="numerals text-vfd [text-shadow:0_0_18px_rgb(127_245_218/0.35)]"
        :class="size === 'small' ? 'text-5xl leading-none' : 'text-[5.5rem] leading-[0.9]'"
        data-testid="your-score"
        :aria-label="target === null ? 'No score' : `${Math.round(target)} out of 100`"
      >
        {{ formatScore(shown) }}
      </p>
      <div class="mt-3 grid grid-cols-20 gap-0.5" aria-hidden="true">
        <span
          v-for="index in SEGMENTS"
          :key="index"
          class="h-1.5 rounded-[1px] transition-colors duration-150"
          :class="index <= litSegments ? 'bg-vfd' : 'bg-vfd-dim'"
          :style="sweepIn ? { transitionDelay: `${index * 12}ms` } : undefined"
        />
      </div>
    </div>
  </section>
</template>
