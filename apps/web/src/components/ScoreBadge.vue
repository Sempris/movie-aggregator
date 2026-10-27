<script setup lang="ts">
import { formatScore } from '@/lib/format';

defineProps<{ score: number | null; pending?: boolean }>();
</script>

<template>
  <span
    class="numerals inline-flex h-8 min-w-10 items-center justify-center rounded-sm bg-display px-2 text-lg text-vfd"
    :aria-label="
      score === null
        ? pending
          ? 'Score loading'
          : 'No score yet'
        : `Your score ${Math.round(score)}`
    "
  >
    <span
      v-if="score === null && pending"
      class="h-1.5 w-5 animate-pulse rounded-full bg-vfd-dim"
    />
    <template v-else>{{ formatScore(score) }}</template>
  </span>
</template>
