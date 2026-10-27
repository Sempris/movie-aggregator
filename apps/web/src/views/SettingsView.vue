<script setup lang="ts">
import { useTitle } from '@vueuse/core';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import MixerConsole from '@/components/MixerConsole.vue';
import { useAuthStore } from '@/stores/auth';
import { usePreferenceSyncStore } from '@/stores/preferenceSync';

useTitle('Your mix · RateMix');
const auth = useAuthStore();
const sync = usePreferenceSyncStore();
const router = useRouter();

const syncMessage = computed(() => {
  switch (sync.status) {
    case 'saving':
      return 'Saving to your account…';
    case 'saved':
      return 'Saved to your account.';
    case 'error':
      return "Your mix couldn't be saved to your account.";
    default:
      return 'Saved in this browser.';
  }
});

async function signOut() {
  await auth.logout();
  await router.push({ name: 'home' });
}
</script>

<template>
  <div class="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6">
    <section class="flex flex-col gap-4" aria-labelledby="mix-heading">
      <div class="flex max-w-3xl flex-col gap-2">
        <h1 id="mix-heading" class="display-condensed text-4xl leading-none">Your mix</h1>
        <p class="max-w-[62ch] text-ink-2">
          These settings apply to every title. A source that's off never counts. Weights are
          relative: a source at ×2 counts twice as much as one at ×1.
        </p>
      </div>
      <MixerConsole />
    </section>

    <section class="flex max-w-xl flex-col gap-3" aria-labelledby="account-heading">
      <h2 id="account-heading" class="display-condensed text-2xl">Account</h2>
      <template v-if="auth.isAuthenticated && auth.user">
        <p>
          Signed in as
          <span class="font-semibold">{{
            auth.user.email ?? auth.user.displayName ?? 'your account'
          }}</span>
        </p>
        <p
          class="text-sm"
          :class="sync.status === 'error' ? 'text-alert' : 'text-ink-2'"
          role="status"
        >
          {{ syncMessage }}
          <button
            v-if="sync.status === 'error'"
            type="button"
            class="ml-2 font-semibold underline underline-offset-4"
            @click="sync.retry()"
          >
            Try again
          </button>
        </p>
        <button
          type="button"
          class="self-start rounded-sm border border-seam px-4 py-2 text-sm font-semibold hover:bg-strip"
          @click="signOut"
        >
          Sign out
        </button>
      </template>
      <template v-else>
        <p class="text-ink-2">
          Your mix is saved in this browser. Sign in to use it on your other devices.
        </p>
        <RouterLink
          :to="{ name: 'signin', query: { redirect: '/settings' } }"
          class="self-start rounded-sm bg-ink px-4 py-2 text-sm font-semibold text-strip hover:bg-ink-2"
        >
          Sign in
        </RouterLink>
      </template>
    </section>
  </div>
</template>
