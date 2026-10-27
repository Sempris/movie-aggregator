<script setup lang="ts">
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui';
import { computed } from 'vue';
import { usePreferenceSyncStore } from '@/stores/preferenceSync';

const sync = usePreferenceSyncStore();
const open = computed(() => sync.conflict !== null);
</script>

<template>
  <AlertDialogRoot :open="open">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-40 bg-ink/40" />
      <AlertDialogContent
        class="fixed top-1/2 left-1/2 z-50 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-md border border-seam bg-panel p-6 shadow-2xl"
      >
        <AlertDialogTitle class="display-condensed text-2xl"
          >Which mix should RateMix use?</AlertDialogTitle
        >
        <AlertDialogDescription class="text-sm text-ink-2">
          This browser and your account have different source settings. Pick one; the other is
          replaced.
        </AlertDialogDescription>
        <div class="flex flex-col gap-2 sm:flex-row-reverse">
          <AlertDialogAction
            class="rounded-sm bg-ink px-4 py-2 text-sm font-semibold text-strip hover:bg-ink-2"
            @click="sync.resolveConflict('keep_device')"
          >
            Keep this browser's mix
          </AlertDialogAction>
          <AlertDialogCancel
            class="rounded-sm border border-seam px-4 py-2 text-sm font-semibold hover:bg-strip"
            @click="sync.resolveConflict('use_account')"
          >
            Use my account's mix
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
