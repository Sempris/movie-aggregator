<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const failed = ref(false);

onMounted(async () => {
  await auth.bootstrap({ force: true });
  if (auth.isAuthenticated) await router.replace({ name: 'settings' });
  else failed.value = true;
});
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-3 px-4 py-16">
    <template v-if="failed">
      <h1 class="display-condensed text-3xl">Sign-in didn't finish</h1>
      <p class="text-ink-2">
        Your browser may be blocking the sign-in cookie. Try again, or sign in with email.
      </p>
      <RouterLink :to="{ name: 'signin' }" class="font-semibold underline underline-offset-4"
        >Back to sign in</RouterLink
      >
    </template>
    <p v-else role="status" class="text-ink-2">Signing you in…</p>
  </div>
</template>
