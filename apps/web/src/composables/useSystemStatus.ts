import type { SystemStatusDto } from '@ratemix/shared';
import { ref } from 'vue';
import { trpc } from '@/lib/trpc';

const status = ref<SystemStatusDto | null>(null);
let pending: Promise<void> | null = null;

/** Which providers and sign-in methods the server has configured (loaded once per session). */
export function useSystemStatus() {
  if (!status.value && !pending) {
    pending = trpc.system.status
      .query()
      .then((value) => {
        status.value = value;
      })
      .catch(() => undefined)
      .finally(() => {
        pending = null;
      });
  }
  return status;
}
