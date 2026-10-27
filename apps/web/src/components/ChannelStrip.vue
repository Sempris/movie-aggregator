<script setup lang="ts">
import {
  type RatingSourceDto,
  type SourcePreference,
  type SourceRatingDto,
  WEIGHT_MAX,
  WEIGHT_STEP,
  WEIGHT_UI_MIN,
} from '@ratemix/shared';
import {
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
  SwitchRoot,
  SwitchThumb,
} from 'reka-ui';
import { computed } from 'vue';
import { channelColor, formatPercent, formatWeight } from '@/lib/format';

const props = defineProps<{
  source: RatingSourceDto;
  preference: SourcePreference;
  /** This title's score from the source; undefined when no title is in view. */
  rating?: SourceRatingDto | null;
  /** Share of the composite this channel accounts for (0-1), or null when it contributes nothing. */
  share: number | null;
  pending?: boolean;
  orientation: 'vertical' | 'horizontal';
}>();

const emit = defineEmits<{
  'update:enabled': [value: boolean];
  'update:weight': [value: number];
}>();

const vertical = computed(() => props.orientation === 'vertical');
const color = computed(() => channelColor(props.source.id));
const sliderValue = computed(() => [Math.max(WEIGHT_UI_MIN, props.preference.weight)]);
const readout = computed(() => {
  if (props.rating === undefined) return null;
  if (props.rating) return props.rating.rawDisplay;
  if (!props.source.available) return 'Not set up';
  return props.pending ? 'Loading' : 'No score';
});

function onWeight(value: number[] | undefined) {
  if (value?.[0] !== undefined) emit('update:weight', value[0]);
}
</script>

<template>
  <div
    :class="
      vertical
        ? 'flex w-full flex-col items-center gap-3 px-2 py-4 text-center'
        : 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3'
    "
    :data-enabled="preference.enabled"
    :data-testid="`channel-${source.id}`"
    :style="{ '--ch': color }"
  >
    <!-- Name and provenance; in rows this spans the first line with the score on the right. -->
    <div :class="vertical ? 'min-h-10' : 'col-span-2 flex items-baseline gap-2'">
      <p class="text-sm leading-tight font-semibold">{{ source.displayName }}</p>
      <p v-if="source.deliveredVia" class="text-xs leading-tight text-ink-2">
        via {{ source.deliveredVia }}
      </p>
    </div>

    <p
      v-if="readout !== null"
      class="numerals leading-7"
      :class="[
        vertical ? 'min-h-7 text-xl' : 'text-right text-lg',
        rating ? 'text-ink' : 'text-sm font-medium text-ink-2 [font-stretch:100%]',
      ]"
      :aria-label="rating ? `${source.displayName} score ${rating.rawDisplay}` : undefined"
    >
      <span
        v-if="pending && !rating"
        class="inline-block h-2 w-8 animate-pulse rounded-full bg-well"
      />
      <template v-else>{{ readout }}</template>
    </p>
    <span v-else-if="!vertical" />

    <SwitchRoot
      :model-value="preference.enabled"
      :aria-label="`Include ${source.displayName} in your score`"
      class="inline-flex h-7 items-center gap-2 rounded-sm border border-seam bg-panel px-2 text-xs font-semibold transition-colors hover:border-ink-2"
      @update:model-value="(value: boolean) => emit('update:enabled', value)"
    >
      <SwitchThumb
        class="size-2.5 rounded-full bg-seam transition-[background-color,box-shadow] data-[state=checked]:bg-(--ch) data-[state=checked]:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ch)_28%,transparent)]"
      />
      <span class="w-6 text-left">{{ preference.enabled ? 'On' : 'Off' }}</span>
    </SwitchRoot>

    <SliderRoot
      :model-value="sliderValue"
      :min="WEIGHT_UI_MIN"
      :max="WEIGHT_MAX"
      :step="WEIGHT_STEP"
      :orientation="orientation"
      class="relative flex touch-none select-none transition-opacity"
      :class="[
        vertical ? 'h-40 w-10 flex-col items-center' : 'h-8 w-full items-center',
        preference.enabled ? '' : 'opacity-45',
      ]"
      @update:model-value="onWeight"
    >
      <SliderTrack class="relative grow rounded-full bg-ink/80" :class="vertical ? 'w-1' : 'h-1'">
        <SliderRange
          class="absolute rounded-full bg-(--ch)"
          :class="vertical ? 'w-full' : 'h-full'"
        />
      </SliderTrack>
      <SliderThumb
        :aria-label="`${source.displayName} weight`"
        :aria-valuetext="formatWeight(preference.weight)"
        class="block rounded-[3px] border border-ink/40 bg-(--ch) shadow-[0_1px_0_rgb(0_0_0/0.25)] transition-transform active:scale-95"
        :class="vertical ? 'h-4 w-8' : 'h-8 w-4'"
      >
        <span
          class="pointer-events-none absolute bg-strip/80"
          :class="vertical ? 'inset-x-1.5 top-1/2 h-px' : 'inset-y-1.5 left-1/2 w-px'"
        />
      </SliderThumb>
    </SliderRoot>

    <div
      class="flex text-xs text-ink-2"
      :class="vertical ? 'w-full flex-col items-center gap-1.5' : 'items-center gap-3'"
    >
      <span class="numerals text-base text-ink" :class="vertical ? '' : 'w-7 text-right'">
        {{ formatWeight(preference.weight) }}
      </span>
      <span class="flex items-center gap-1.5" :class="vertical ? 'w-full max-w-16' : ''">
        <span
          v-if="vertical"
          class="relative h-1 flex-1 overflow-hidden rounded-full bg-well"
          aria-hidden="true"
        >
          <span
            class="absolute inset-y-0 left-0 rounded-full bg-(--ch) transition-[width] duration-150"
            :style="{ width: `${(share ?? 0) * 100}%` }"
          />
        </span>
        <span
          class="numerals w-9 text-right text-sm"
          :aria-label="`${formatPercent(share ?? 0)} of your score`"
        >
          {{ share === null ? '–' : formatPercent(share) }}
        </span>
      </span>
    </div>
  </div>
</template>
