import type { AuthSessionDto, LoginInput, RegisterInput, UserDto } from '@ratemix/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { session } from '@/lib/session';
import { trpc } from '@/lib/trpc';

/** Non-sensitive hint so guests don't make a refresh request on every page load. */
const SESSION_HINT_KEY = 'ratemix:has-session';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserDto | null>(null);
  const status = ref<'unknown' | 'guest' | 'authenticated'>('unknown');
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  const isAuthenticated = computed(() => status.value === 'authenticated');

  function applySession(dto: AuthSessionDto) {
    session.set(dto.accessToken);
    user.value = dto.user;
    status.value = 'authenticated';
    localStorage.setItem(SESSION_HINT_KEY, '1');
    clearTimeout(refreshTimer);
    const delay = Date.parse(dto.accessTokenExpiresAt) - Date.now() - 60_000;
    refreshTimer = setTimeout(() => void session.refresh(), Math.max(5_000, delay));
  }

  function clearSession() {
    clearTimeout(refreshTimer);
    session.clear();
    user.value = null;
    status.value = 'guest';
    localStorage.removeItem(SESSION_HINT_KEY);
  }

  async function refresh(): Promise<boolean> {
    try {
      const dto = await trpc.auth.refresh.mutate();
      if (dto) {
        applySession(dto);
        return true;
      }
    } catch {
      // treated as signed out below
    }
    clearSession();
    return false;
  }
  session.registerRefresher(refresh);

  async function bootstrap(options: { force?: boolean } = {}) {
    if (options.force || localStorage.getItem(SESSION_HINT_KEY)) {
      await session.refresh();
    } else {
      status.value = 'guest';
    }
  }

  async function login(input: LoginInput) {
    applySession(await trpc.auth.login.mutate(input));
  }

  async function register(input: RegisterInput) {
    applySession(await trpc.auth.register.mutate(input));
  }

  async function logout() {
    try {
      await trpc.auth.logout.mutate();
    } finally {
      clearSession();
    }
  }

  return { user, status, isAuthenticated, bootstrap, login, register, logout };
});
