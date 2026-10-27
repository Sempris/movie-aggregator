import { usePreferredReducedMotion } from '@vueuse/core';
import { computed } from 'vue';

export function useReducedMotion() {
  const preference = usePreferredReducedMotion();
  return computed(() => preference.value === 'reduce');
}
