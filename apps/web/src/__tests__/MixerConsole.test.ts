import type { SourceRatingDto } from '@ratemix/shared';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import MixerConsole from '@/components/MixerConsole.vue';
import { useSourcePreferencesStore } from '@/stores/sourcePreferences';

vi.mock('@/lib/trpc', () => ({ trpc: {}, describeError: () => '', isTrpcError: () => false }));

const rating = (
  sourceId: SourceRatingDto['sourceId'],
  normalizedValue: number,
  rawDisplay: string,
): SourceRatingDto => ({
  sourceId,
  normalizedValue,
  rawValue: normalizedValue,
  rawDisplay,
  voteCount: null,
  fetchedAt: '2026-09-10T00:00:00Z',
});

const movie = {
  ratingsPending: false,
  ratings: [
    rating('tmdb', 72, '7.2/10'),
    rating('imdb', 81, '8.1/10'),
    rating('rotten_tomatoes', 94, '94%'),
    rating('metacritic', 68, '68/100'),
    rating('trakt', 75, '7.5/10'),
  ],
};

describe('MixerConsole', () => {
  beforeEach(() => setActivePinia(createPinia()));

  const score = (wrapper: ReturnType<typeof mount>) =>
    wrapper.get('[data-testid="your-score"]').text();

  it('shows the equal-weight composite and each source score', () => {
    const wrapper = mount(MixerConsole, { props: { movie, layout: 'rows' } });
    expect(score(wrapper)).toBe('78');
    expect(wrapper.get('[data-testid="channel-rotten_tomatoes"]').text()).toContain('94%');
  });

  it('recomputes instantly when a source is switched off', async () => {
    const wrapper = mount(MixerConsole, { props: { movie, layout: 'rows' } });
    await wrapper.get('[data-testid="channel-rotten_tomatoes"] [role="switch"]').trigger('click');
    await nextTick();
    expect(useSourcePreferencesStore().resolved.rotten_tomatoes?.enabled).toBe(false);
    expect(score(wrapper)).toBe('74');
    expect(wrapper.get('[data-testid="your-score-caption"]').text()).toBe('From 4 sources');
  });

  it('reflects weight changes and explains when nothing can be scored', async () => {
    const store = useSourcePreferencesStore();
    const wrapper = mount(MixerConsole, { props: { movie, layout: 'rows' } });
    store.setWeight('imdb', 2);
    store.setEnabled('rotten_tomatoes', false);
    await nextTick();
    expect(score(wrapper)).toBe('75');

    const sparse = { ratingsPending: false, ratings: [rating('tmdb', 60, '6.0/10')] };
    store.setEnabled('tmdb', false);
    await wrapper.setProps({ movie: sparse });
    expect(score(wrapper)).toBe('–');
    expect(wrapper.get('[data-testid="your-score-caption"]').text()).toBe(
      'None of your sources rate this title yet',
    );
  });
});
