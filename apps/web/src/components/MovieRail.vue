<script setup lang="ts">
import type { MovieSummaryDto } from '@ratemix/shared';
import MovieCard from './MovieCard.vue';

defineProps<{
  title: string;
  movies: MovieSummaryDto[];
  status: 'loading' | 'ready' | 'error';
  error?: string | null;
}>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <section class="flex flex-col gap-4" :aria-label="title">
    <h2 class="display-condensed text-2xl">{{ title }}</h2>
    <p v-if="status === 'error'" class="text-sm text-alert">
      {{ error }}
      <button
        type="button"
        class="ml-2 font-semibold underline underline-offset-4"
        @click="$emit('retry')"
      >
        Try again
      </button>
    </p>
    <ul
      v-else
      class="-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 [&>li]:w-36 [&>li]:shrink-0 [&>li]:snap-start sm:[&>li]:w-40"
    >
      <template v-if="status === 'loading'">
        <li v-for="index in 8" :key="index" aria-hidden="true">
          <div class="aspect-[2/3] animate-pulse rounded-sm bg-well" />
          <div class="mt-2 h-3 w-3/4 animate-pulse rounded-sm bg-well" />
        </li>
      </template>
      <li v-for="movie in movies" v-else :key="movie.tmdbId">
        <MovieCard :movie="movie" />
      </li>
    </ul>
  </section>
</template>
