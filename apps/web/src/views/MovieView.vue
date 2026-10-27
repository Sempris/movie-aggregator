<script setup lang="ts">
import { useTitle } from '@vueuse/core';
import { computed } from 'vue';
import MixerConsole from '@/components/MixerConsole.vue';
import SourceReadouts from '@/components/SourceReadouts.vue';
import { useMovieDetail } from '@/composables/useMovieDetail';
import { formatRuntime } from '@/lib/format';

const props = defineProps<{ tmdbId: number }>();
const { movie, preview, status, error, reload } = useMovieDetail(() => props.tmdbId);

const shown = computed(() => movie.value ?? preview.value ?? null);
useTitle(computed(() => (shown.value ? `${shown.value.title} · RateMix` : 'RateMix')));

const facts = computed(() => {
  const detail = movie.value;
  if (!detail) return [];
  return [
    detail.releaseYear ? String(detail.releaseYear) : null,
    formatRuntime(detail.runtimeMinutes),
    detail.genres.length ? detail.genres.join(', ') : null,
  ].filter((fact): fact is string => Boolean(fact));
});
</script>

<template>
  <div class="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6">
    <div v-if="status === 'not_found'" class="flex max-w-xl flex-col gap-3 py-12">
      <h1 class="display-condensed text-3xl">This title isn't available</h1>
      <p class="text-ink-2">
        TMDB doesn't list a movie with this ID. Search for it by name instead.
      </p>
      <RouterLink :to="{ name: 'home' }" class="font-semibold underline underline-offset-4"
        >Go to the home page</RouterLink
      >
    </div>

    <div v-else-if="status === 'error' && !shown" class="flex max-w-xl flex-col gap-3 py-12">
      <h1 class="display-condensed text-3xl">This title could not be loaded</h1>
      <p class="text-ink-2">{{ error }}</p>
      <button
        type="button"
        class="self-start rounded-sm bg-ink px-4 py-2 text-sm font-semibold text-strip"
        @click="reload"
      >
        Try again
      </button>
    </div>

    <template v-else>
      <div class="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div class="hidden md:block">
          <img
            v-if="shown?.posterUrl"
            :src="shown.posterUrl"
            alt=""
            class="aspect-[2/3] w-full rounded-sm bg-well object-cover"
          />
          <div v-else class="aspect-[2/3] w-full animate-pulse rounded-sm bg-well" />
        </div>

        <div class="flex min-w-0 flex-col gap-4">
          <div v-if="shown" class="flex flex-col gap-2">
            <h1
              class="display-condensed text-4xl leading-none sm:text-5xl"
              data-testid="movie-title"
            >
              {{ shown.title }}
            </h1>
            <p
              v-if="movie?.originalTitle && movie.originalTitle !== movie.title"
              class="text-ink-2"
            >
              {{ movie.originalTitle }}
            </p>
            <ul v-if="facts.length" class="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
              <li v-for="fact in facts" :key="fact">{{ fact }}</li>
            </ul>
          </div>
          <div v-else class="h-12 w-2/3 animate-pulse rounded-sm bg-well" />

          <p v-if="movie?.overview" class="max-w-[68ch] text-base leading-relaxed">
            {{ movie.overview }}
          </p>

          <p v-if="shown?.ratingsPending" class="text-sm text-ink-2" role="status">
            Some sources are still being fetched. Scores fill in as they arrive.
          </p>
          <p v-if="error && movie" class="text-sm text-alert" role="status">{{ error }}</p>

          <div class="flex flex-wrap gap-4 text-sm font-semibold">
            <a
              v-if="movie?.links.tmdb"
              :href="movie.links.tmdb"
              target="_blank"
              rel="noopener"
              class="underline underline-offset-4"
            >
              View on TMDB
            </a>
            <a
              v-if="movie?.links.imdb"
              :href="movie.links.imdb"
              target="_blank"
              rel="noopener"
              class="underline underline-offset-4"
            >
              View on IMDb
            </a>
          </div>
        </div>
      </div>

      <MixerConsole :key="tmdbId" :movie="shown" sweep-in />
      <SourceReadouts v-if="movie" :movie="movie" />
    </template>
  </div>
</template>
