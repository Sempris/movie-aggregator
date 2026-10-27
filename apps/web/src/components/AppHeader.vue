<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { channelColor } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useSourcePreferencesStore } from '@/stores/sourcePreferences';
import { useSourcesStore } from '@/stores/sources';
import { useUiStore } from '@/stores/ui';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();
const sources = useSourcesStore();
const preferences = useSourcePreferencesStore();

const query = ref(typeof route.query['q'] === 'string' ? route.query['q'] : '');
watch(
  () => route.query['q'],
  (value) => {
    const next = typeof value === 'string' ? value : '';
    if (next !== query.value) query.value = next;
  },
);

/** On the home page results update as you type; elsewhere, pressing Enter opens them. */
function onInput() {
  if (route.name === 'home') {
    void router.replace({ name: 'home', query: query.value ? { q: query.value } : {} });
  }
}

function onSubmit() {
  void router.push({ name: 'home', query: query.value.trim() ? { q: query.value.trim() } : {} });
}

const lamps = computed(() =>
  sources.sources.map((source) => ({
    id: source.id,
    on: preferences.resolved[source.id]?.enabled ?? false,
  })),
);
</script>

<template>
  <header
    class="border-b border-seam bg-panel/95 backdrop-blur supports-[backdrop-filter]:bg-panel/80"
  >
    <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
      <RouterLink :to="{ name: 'home' }" class="wordmark text-xl leading-none">RateMix</RouterLink>

      <form
        role="search"
        class="order-last w-full sm:order-none sm:w-auto sm:flex-1"
        @submit.prevent="onSubmit"
      >
        <label for="site-search" class="sr-only">Search movies</label>
        <input
          id="site-search"
          v-model="query"
          type="search"
          autocomplete="off"
          placeholder="Search movies"
          class="h-10 w-full max-w-lg rounded-sm border border-seam bg-strip px-3 text-base placeholder:text-ink-2 focus:border-ink focus:outline-none"
          @input="onInput"
        />
      </form>

      <div class="ml-auto flex items-center gap-2">
        <button
          type="button"
          class="flex h-10 items-center gap-2.5 rounded-sm border border-seam bg-strip px-3 text-sm font-semibold hover:border-ink-2"
          :aria-label="`Open your mix, ${preferences.enabledCount} of ${sources.sources.length} sources on`"
          data-testid="open-mixer"
          @click="ui.mixerOpen = true"
        >
          <span class="flex gap-1" aria-hidden="true">
            <span
              v-for="lamp in lamps"
              :key="lamp.id"
              class="size-2 rounded-full"
              :style="{ backgroundColor: lamp.on ? channelColor(lamp.id) : 'var(--color-seam)' }"
            />
          </span>
          Your mix
        </button>
        <RouterLink
          v-if="auth.isAuthenticated"
          :to="{ name: 'settings' }"
          class="flex h-10 items-center rounded-sm px-3 text-sm font-semibold hover:bg-strip"
        >
          Account
        </RouterLink>
        <RouterLink
          v-else
          :to="{
            name: 'signin',
            query: route.name === 'signin' ? {} : { redirect: route.fullPath },
          }"
          class="flex h-10 items-center rounded-sm px-3 text-sm font-semibold hover:bg-strip"
        >
          Sign in
        </RouterLink>
      </div>
    </div>
  </header>
</template>
