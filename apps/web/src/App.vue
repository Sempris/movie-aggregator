<script setup lang="ts">
import { onMounted } from 'vue';
import AppHeader from '@/components/AppHeader.vue';
import MixerDrawer from '@/components/MixerDrawer.vue';
import PreferenceConflictDialog from '@/components/PreferenceConflictDialog.vue';
import SiteFooter from '@/components/SiteFooter.vue';
import { useAuthStore } from '@/stores/auth';
import { usePreferenceSyncStore } from '@/stores/preferenceSync';
import { useSourcesStore } from '@/stores/sources';

const sources = useSourcesStore();
const auth = useAuthStore();
const sync = usePreferenceSyncStore();

sync.start();
onMounted(() => {
  void sources.load();
  void auth.bootstrap();
});
</script>

<template>
  <a
    href="#main"
    class="sr-only z-50 rounded-sm bg-ink px-3 py-2 text-strip focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
  >
    Skip to content
  </a>
  <div class="flex min-h-dvh flex-col">
    <AppHeader />
    <main id="main" class="flex-1">
      <RouterView />
    </main>
    <SiteFooter />
  </div>
  <MixerDrawer />
  <PreferenceConflictDialog />
</template>
