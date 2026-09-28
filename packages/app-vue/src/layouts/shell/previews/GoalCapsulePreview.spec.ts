/** @vitest-environment jsdom */
import { computed, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GoalCapsulePreview from './GoalCapsulePreview.vue';

const goalProgressRef = ref<
  Array<{
    id: string;
    name: string;
    progress: number;
    status: 'Planned' | 'InProgress';
    target: { kind: 'day'; date: string } | null;
    keyResultCount: number;
  }>
>([]);
const activeGoalsRef = ref(0);
const isLoadingRef = ref(false);
const errorRef = ref<string | null>(null);
const ensureGoalSummary = vi.fn().mockResolvedValue(undefined);
const refreshGoalSummary = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../modules/goal/composables/useGoalHomeSummary', () => ({
  useGoalHomeSummary: () => ({
    goals: computed(() => goalProgressRef.value),
    activeCount: computed(() => activeGoalsRef.value),
    isLoading: computed(() => isLoadingRef.value),
    error: computed(() => errorRef.value),
    ensure: ensureGoalSummary,
    refresh: refreshGoalSummary,
  }),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      nav: { capsule: { goal: 'Goal' } },
      shell: {
        enterModule: 'Enter',
        preview: { goalEmpty: 'No active goals' },
        goalWorkspace: {
          attention: 'Needs attention',
          noTarget: 'No target date',
          krCount: '{count} key results',
          viewAll: 'View all goals',
        },
      },
      common: { retry: 'Retry' },
    },
  },
});

function mountPreview() {
  return mount(GoalCapsulePreview, { global: { plugins: [i18n] } });
}

describe('GoalCapsulePreview', () => {
  afterEach(() => {
    goalProgressRef.value = [];
    activeGoalsRef.value = 0;
    isLoadingRef.value = false;
    errorRef.value = null;
    vi.clearAllMocks();
  });

  it('loads the Goal owner summary on mount and renders items', async () => {
    goalProgressRef.value = [
      {
        id: 'g1',
        name: 'Ship V2',
        progress: 40,
        status: 'InProgress',
        target: { kind: 'day', date: '2026-10-02' },
        keyResultCount: 3,
      },
      {
        id: 'g2',
        name: 'Grow users',
        progress: 10,
        status: 'Planned',
        target: { kind: 'day', date: '2026-09-30' },
        keyResultCount: 2,
      },
    ];
    activeGoalsRef.value = 2;
    const wrapper = mountPreview();
    await nextTick();
    expect(ensureGoalSummary).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="goal-capsule-list"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="goal-capsule-count"]').text()).toBe('2');
    expect(wrapper.find('[data-testid="goal-capsule-item-g1"]').exists()).toBe(true);
    expect(
      wrapper.findAll('[data-testid^="goal-capsule-item-"]')[0]?.attributes('data-testid'),
    ).toBe('goal-capsule-item-g2');
    expect(wrapper.get('[data-testid="goal-capsule-item-g1"]').text()).toContain('3 key results');
    await wrapper.get('[data-testid="goal-capsule-view-all"]').trigger('click');
    expect(wrapper.emitted('view-all')).toBeTruthy();
    wrapper.unmount();
  });

  it('shows empty / loading / error states', async () => {
    isLoadingRef.value = true;
    let wrapper = mountPreview();
    await nextTick();
    expect(wrapper.find('[data-testid="goal-capsule-loading"]').exists()).toBe(true);
    wrapper.unmount();

    isLoadingRef.value = false;
    goalProgressRef.value = [];
    wrapper = mountPreview();
    await nextTick();
    expect(wrapper.find('[data-testid="goal-capsule-empty"]').exists()).toBe(true);
    wrapper.unmount();

    errorRef.value = 'boom';
    refreshGoalSummary.mockImplementationOnce(async () => {
      // error ref already set by mock state
    });
    wrapper = mountPreview();
    await nextTick();
    await nextTick();
    expect(wrapper.find('[data-testid="goal-capsule-error"]').exists()).toBe(true);
    await wrapper.get('[data-testid="goal-capsule-retry"]').trigger('click');
    expect(refreshGoalSummary).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
