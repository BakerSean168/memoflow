/** @vitest-environment jsdom */
import { computed, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GoalCapsulePreview from './GoalCapsulePreview.vue';

const goalProgressRef = ref<Array<{ id: string; name: string; progress: number }>>([]);
const activeGoalsRef = ref(0);
const isLoadingRef = ref(false);
const errorRef = ref<string | null>(null);
const refreshGoalSummary = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../modules/goal/composables/useGoalHomeSummary', () => ({
  useGoalHomeSummary: () => ({
    goals: computed(() => goalProgressRef.value),
    activeCount: computed(() => activeGoalsRef.value),
    isLoading: computed(() => isLoadingRef.value),
    error: computed(() => errorRef.value),
    refresh: refreshGoalSummary,
  }),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      nav: { capsule: { goal: 'Goal' } },
      shell: { enterModule: 'Enter', preview: { goalEmpty: 'No active goals' } },
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
      { id: 'g1', name: 'Ship V2', progress: 40 },
      { id: 'g2', name: 'Grow users', progress: 10 },
    ];
    activeGoalsRef.value = 2;
    const wrapper = mountPreview();
    await nextTick();
    expect(refreshGoalSummary).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="goal-capsule-list"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="goal-capsule-count"]').text()).toBe('2');
    expect(wrapper.find('[data-testid="goal-capsule-item-g1"]').exists()).toBe(true);
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
    expect(refreshGoalSummary.mock.calls.length).toBeGreaterThan(1);
    wrapper.unmount();
  });
});
