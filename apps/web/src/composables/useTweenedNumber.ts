import { type MaybeRefOrGetter, onScopeDispose, ref, toValue, watch } from 'vue';
import { useReducedMotion } from './useReducedMotion';

/**
 * Follows a number with a short ease-out. `sweepIn` starts from zero on mount, used once
 * per page as the console's "power-on" moment. Reduced-motion users get the value directly.
 */
export function useTweenedNumber(
  source: MaybeRefOrGetter<number | null>,
  options: { duration?: number; sweepIn?: boolean } = {},
) {
  const reduced = useReducedMotion();
  const initial = toValue(source);
  const current = ref<number | null>(options.sweepIn && initial !== null ? 0 : initial);
  let frame = 0;

  function animateTo(target: number | null, duration: number) {
    cancelAnimationFrame(frame);
    if (target === null || current.value === null || reduced.value || duration <= 0) {
      current.value = target;
      return;
    }
    const from = current.value;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      current.value = from + (target - from) * eased;
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  if (options.sweepIn && initial !== null) animateTo(initial, 700);
  watch(
    () => toValue(source),
    (target) => animateTo(target, options.duration ?? 160),
  );
  onScopeDispose(() => cancelAnimationFrame(frame));
  return current;
}
