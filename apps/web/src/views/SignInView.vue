<script setup lang="ts">
import { loginInput, registerInput } from '@ratemix/shared';
import { useTitle } from '@vueuse/core';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSystemStatus } from '@/composables/useSystemStatus';
import { API_ORIGIN, describeError } from '@/lib/trpc';
import { useAuthStore } from '@/stores/auth';

const OAUTH_ERRORS: Record<string, string> = {
  oauth_unavailable: 'That sign-in option isn’t set up on this server.',
  oauth_denied: 'Sign-in was cancelled.',
  oauth_state: 'The sign-in link expired. Try again.',
  oauth_failed: 'Signing in with that provider failed. Try again.',
  email_in_use: 'An account with that email already exists. Sign in with your email and password.',
};
const PROVIDER_NAMES = { github: 'GitHub', google: 'Google' } as const;

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const system = useSystemStatus();

const mode = ref<'signin' | 'register'>('signin');
const email = ref('');
const password = ref('');
const displayName = ref('');
const submitting = ref(false);
const error = ref<string | null>(
  typeof route.query['error'] === 'string' ? (OAUTH_ERRORS[route.query['error']] ?? null) : null,
);

useTitle(
  computed(() => (mode.value === 'signin' ? 'Sign in · RateMix' : 'Create account · RateMix')),
);

const redirectTarget = computed(() => {
  const target = route.query['redirect'];
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
    ? target
    : '/';
});

async function submit() {
  error.value = null;
  submitting.value = true;
  try {
    if (mode.value === 'signin') {
      const parsed = loginInput.safeParse({ email: email.value, password: password.value });
      if (!parsed.success) return showIssue(parsed.error.issues);
      await auth.login(parsed.data);
    } else {
      const parsed = registerInput.safeParse({
        email: email.value,
        password: password.value,
        displayName: displayName.value.trim() || undefined,
      });
      if (!parsed.success) return showIssue(parsed.error.issues);
      await auth.register(parsed.data);
    }
    await router.replace(redirectTarget.value);
  } catch (caught) {
    error.value = describeError(caught);
  } finally {
    submitting.value = false;
  }
}

function showIssue(issues: ReadonlyArray<{ message: string }>) {
  error.value = issues[0]?.message ?? 'Check the form and try again.';
}
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
    <div class="flex flex-col gap-2">
      <h1 class="display-condensed text-4xl leading-none">
        {{ mode === 'signin' ? 'Sign in' : 'Create an account' }}
      </h1>
      <p class="text-ink-2">
        An account keeps your mix in sync across devices. Everything else works without one.
      </p>
    </div>

    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <label v-if="mode === 'register'" class="flex flex-col gap-1 text-sm font-semibold">
        Name <span class="font-normal text-ink-2">(optional)</span>
        <input
          v-model="displayName"
          autocomplete="name"
          class="h-10 rounded-sm border border-seam bg-strip px-3 text-base font-normal focus:border-ink focus:outline-none"
        />
      </label>
      <label class="flex flex-col gap-1 text-sm font-semibold">
        Email
        <input
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="h-10 rounded-sm border border-seam bg-strip px-3 text-base font-normal focus:border-ink focus:outline-none"
        />
      </label>
      <label class="flex flex-col gap-1 text-sm font-semibold">
        Password
        <input
          v-model="password"
          type="password"
          required
          :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
          class="h-10 rounded-sm border border-seam bg-strip px-3 text-base font-normal focus:border-ink focus:outline-none"
        />
        <span v-if="mode === 'register'" class="text-xs font-normal text-ink-2"
          >At least 10 characters.</span
        >
      </label>

      <p v-if="error" class="text-sm text-alert" role="alert">{{ error }}</p>

      <button
        type="submit"
        :disabled="submitting"
        class="h-10 rounded-sm bg-ink px-4 text-sm font-semibold text-strip hover:bg-ink-2 disabled:opacity-60"
      >
        {{ submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account' }}
      </button>
    </form>

    <div v-if="system?.oauthProviders.length" class="flex flex-col gap-2">
      <a
        v-for="provider in system.oauthProviders"
        :key="provider"
        :href="`${API_ORIGIN}/auth/oauth/${provider}`"
        class="flex h-10 items-center justify-center rounded-sm border border-seam text-sm font-semibold hover:bg-strip"
      >
        Continue with {{ PROVIDER_NAMES[provider] }}
      </a>
    </div>

    <p class="text-sm text-ink-2">
      <template v-if="mode === 'signin'">
        New to RateMix?
        <button
          type="button"
          class="font-semibold text-ink underline underline-offset-4"
          @click="
            mode = 'register';
            error = null;
          "
        >
          Create an account
        </button>
      </template>
      <template v-else>
        Already have an account?
        <button
          type="button"
          class="font-semibold text-ink underline underline-offset-4"
          @click="
            mode = 'signin';
            error = null;
          "
        >
          Sign in
        </button>
      </template>
    </p>
  </div>
</template>
