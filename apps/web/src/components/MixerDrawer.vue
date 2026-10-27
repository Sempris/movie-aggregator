<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useMovieCacheStore } from '@/stores/movieCache';
import { useUiStore } from '@/stores/ui';
import MixerConsole from './MixerConsole.vue';

const ui = useUiStore();
const route = useRoute();
const cache = useMovieCacheStore();
/** On a movie page the drawer shows that title's score, so changes are visible immediately. */
const movie = computed(() =>
  route.name === 'movie' ? cache.get(Number(route.params['tmdbId'])) : undefined,
);
</script>

<template>
  <DialogRoot v-model:open="ui.mixerOpen">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-40 bg-ink/30 data-[state=open]:animate-[fade-in_150ms_ease-out]"
      />
      <DialogContent
        class="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-seam bg-panel p-5 shadow-2xl focus:outline-none data-[state=open]:animate-[slide-in_200ms_ease-out]"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <DialogTitle class="display-condensed text-2xl">Your mix</DialogTitle>
            <DialogDescription class="text-sm text-ink-2">
              Changes apply to every title right away.
            </DialogDescription>
            <p v-if="movie" class="mt-1 text-sm">
              Showing scores for <span class="font-semibold">{{ movie.title }}</span>
            </p>
          </div>
          <DialogClose class="rounded-sm px-2 py-1 text-sm font-semibold hover:bg-strip"
            >Close</DialogClose
          >
        </div>
        <MixerConsole layout="rows" :movie="movie" />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
@keyframes slide-in {
  from {
    transform: translateX(24px);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
