<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import MixerConsole from '@/components/MixerConsole.vue';
import MovieCard from '@/components/MovieCard.vue';
import MovieRail from '@/components/MovieRail.vue';
import { useMovieList } from '@/composables/useMovieList';
import { useMovieSearch } from '@/composables/useMovieSearch';
import { useSystemStatus } from '@/composables/useSystemStatus';

const route = useRoute();
const query = computed(() => (typeof route.query['q'] === 'string' ? route.query['q'] : ''));
const searching = computed(() => query.value.trim().length >= 2);

const search = useMovieSearch(query);
const trending = useMovieList('trending');
const popular = useMovieList('popular');
const system = useSystemStatus();

const featured = computed(
  () => trending.movies.value.find((movie) => movie.ratings.length > 1) ?? trending.movies.value[0],
);
const catalogMissing = computed(
  () =>
    trending.status.value === 'ready' &&
    trending.movies.value.length === 0 &&
    system.value?.providers.tmdb === false,
);
</script>

<template>
  <div class="mx-auto flex max-w-7xl flex-col gap-12 px-4 py-8 sm:px-6">
    <section v-if="searching" class="flex flex-col gap-6" aria-live="polite">
      <h1 class="display-condensed text-3xl">Results for “{{ query.trim() }}”</h1>
      <p v-if="search.result.value?.origin === 'local'" class="text-sm text-ink-2">
        The movie catalog can't be searched right now, so these are titles already in RateMix.
      </p>
      <p v-if="search.status.value === 'error'" class="text-alert">{{ search.error.value }}</p>
      <ul
        v-else-if="search.status.value === 'loading' && search.movies.value.length === 0"
        class="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 lg:grid-cols-6"
        aria-hidden="true"
      >
        <li
          v-for="index in 12"
          :key="index"
          class="aspect-[2/3] animate-pulse rounded-sm bg-well"
        />
      </ul>
      <p
        v-else-if="search.status.value === 'ready' && search.movies.value.length === 0"
        class="text-ink-2"
      >
        No titles match “{{ query.trim() }}”. Check the spelling or try the original title.
      </p>
      <ul v-else class="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 lg:grid-cols-6">
        <li v-for="movie in search.movies.value" :key="movie.tmdbId">
          <MovieCard :movie="movie" />
        </li>
      </ul>
    </section>

    <template v-else>
      <section class="flex flex-col gap-6" aria-labelledby="hero-heading">
        <div class="flex max-w-3xl flex-col gap-3">
          <h1 id="hero-heading" class="display-condensed text-4xl leading-none sm:text-5xl">
            Mix your own movie score
          </h1>
          <p class="max-w-[62ch] text-lg text-ink-2">
            TMDB, IMDb, Rotten Tomatoes, Metacritic and Trakt, side by side. Turn sources on or off
            and set how much each one counts. Your score updates on every title.
          </p>
        </div>

        <p v-if="catalogMissing" class="rounded-md border border-seam bg-strip p-4 text-sm">
          The catalog is empty because the API has no TMDB key. Add
          <code class="font-semibold">TMDB_API_KEY</code> to
          <code class="font-semibold">apps/api/.env</code> and restart the API. You can still set up
          your mix below.
        </p>

        <div class="grid gap-6 lg:grid-cols-[11rem_minmax(0,1fr)]">
          <RouterLink
            v-if="featured"
            :to="{ name: 'movie', params: { tmdbId: featured.tmdbId } }"
            class="group hidden flex-col gap-2 lg:flex"
          >
            <img
              v-if="featured.posterUrl"
              :src="featured.posterUrl"
              alt=""
              class="aspect-[2/3] w-full rounded-sm object-cover"
            />
            <span
              class="text-sm font-semibold group-hover:underline group-hover:underline-offset-2"
            >
              {{ featured.title }}
              <span v-if="featured.releaseYear" class="font-normal text-ink-2"
                >({{ featured.releaseYear }})</span
              >
            </span>
          </RouterLink>
          <div class="flex flex-col gap-2" :class="featured ? '' : 'lg:col-span-2'">
            <p v-if="featured" class="text-sm text-ink-2 lg:hidden">
              Showing scores for
              <RouterLink
                :to="{ name: 'movie', params: { tmdbId: featured.tmdbId } }"
                class="font-semibold text-ink underline underline-offset-2"
              >
                {{ featured.title }}
              </RouterLink>
            </p>
            <MixerConsole :movie="featured ?? undefined" sweep-in />
          </div>
        </div>
      </section>

      <MovieRail
        title="Trending today"
        :movies="trending.movies.value"
        :status="trending.status.value"
        :error="trending.error.value"
        @retry="trending.reload"
      />
      <MovieRail
        title="Popular"
        :movies="popular.movies.value"
        :status="popular.status.value"
        :error="popular.error.value"
        @retry="popular.reload"
      />
    </template>
  </div>
</template>
