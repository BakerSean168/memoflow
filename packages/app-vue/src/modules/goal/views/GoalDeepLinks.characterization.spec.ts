import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { productionLocaleMessages } from '../../../locales/production-messages';
import { goalRoutes } from '../router';
import KeyResultDetailView from './KeyResultDetailView.vue';
import GoalReviewCreationView from './GoalReviewCreationView.vue';
import GoalReviewDetailView from './GoalReviewDetailView.vue';

const calls = vi.hoisted(() => ({
  getGoalAggregateView: vi.fn(),
  createReview: vi.fn(),
  getGoalReviewContext: vi.fn(),
}));
const kr = {
  id: 'kr-1',
  title: 'Distance',
  description: 'Walk daily',
  target: null,
  weight: 3,
  progress: {
    aggregationMethod: 'Sum',
    initialValue: 0,
    currentValue: 4,
    targetValue: 10,
    unit: 'km',
  },
  progressPercentage: 40,
  isCompleted: false,
};
const context = {
  overallProgress: { endPercentage: 40, deltaPercentage: 10 },
  summary: { recordCount: 3, manualRecordCount: 2, taskContributionCount: 1 },
  keyResults: [
    {
      keyResultId: 'kr-1',
      title: 'Distance',
      unit: 'km',
      startPercentage: 30,
      endPercentage: 40,
      trend: [],
    },
  ],
};
const review = {
  id: 'review-1',
  reflection: 'Steady progress',
  challenges: 'Rain',
  adjustments: 'Walk indoors',
  reviewedAt: Date.parse('2026-09-30T12:00:00Z'),
  systemContext: context,
};
const keyResults = ref<(typeof kr)[]>([]);
const goalReviews = ref<(typeof review)[]>([]);
vi.mock('../composables/useGoal', () => ({
  useGoal: () => ({ keyResults, goalReviews, ...calls }),
}));
enableAutoUnmount(afterEach);
beforeEach(() => {
  vi.clearAllMocks();
  keyResults.value = [];
  goalReviews.value = [];
  calls.getGoalAggregateView.mockImplementation(async () => {
    keyResults.value = [kr];
    goalReviews.value = [review];
  });
  calls.getGoalReviewContext.mockResolvedValue({ ok: true, data: context });
  calls.createReview.mockResolvedValue(review);
});

async function load(url: string) {
  // Keep production route contracts and real detail views; isolate unrelated shell/list views.
  // Resolve lazy views eagerly so module compilation does not consume navigation/test timeouts.
  const parent = goalRoutes[0]!;
  const probe = defineComponent(() => () => h('div', 'Goal destination'));
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        ...parent,
        component: RouterView,
        children: parent.children!.map((route) => ({
          ...route,
          component:
            route.name === 'key-result-detail'
              ? KeyResultDetailView
              : route.name === 'goal-review-create'
                ? GoalReviewCreationView
                : route.name === 'goal-review-detail'
                  ? GoalReviewDetailView
                  : probe,
        })),
      },
    ],
  });
  await router.push(url);
  await router.isReady();
  const wrapper = mount(RouterView, {
    global: {
      plugins: [
        router,
        createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages }),
      ],
      provide: {
        [GOAL_SERVICE_KEY as symbol]: { getGoalReviewContext: calls.getGoalReviewContext },
      },
    },
  });
  await flushPromises();
  return { router, wrapper };
}

describe('Goal deep links — PVC-BASE-002', () => {
  it('loads a KR from an empty store on direct load and refresh, then closes to its Goal', async () => {
    for (let refresh = 0; refresh < 2; refresh++) {
      keyResults.value = [];
      const { router, wrapper } = await load('/goals/goal-1/key-results/kr-1');
      expect(calls.getGoalAggregateView).toHaveBeenLastCalledWith('goal-1');
      expect(wrapper.get('h1').text()).toBe('Distance');
      expect(wrapper.get('article').text()).toContain('4 / 10 km');
      expect(router.currentRoute.value.name).toBe('key-result-detail');
      await wrapper.get('button').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe('/goals/goal-1');
      expect(wrapper.find('article').exists()).toBe(false);
      wrapper.unmount();
    }
    expect(calls.getGoalAggregateView).toHaveBeenCalledTimes(2);
  });

  it.each(['missing-kr', 'missing-goal'])(
    'keeps a blank KR body and a working close for %s',
    async (missing) => {
      if (missing === 'missing-goal') calls.getGoalAggregateView.mockResolvedValueOnce(null);
      const goalId = missing === 'missing-goal' ? missing : 'goal-1';
      const { router, wrapper } = await load(`/goals/${goalId}/key-results/missing-kr`);
      expect(calls.getGoalAggregateView).toHaveBeenCalledWith(goalId);
      expect(wrapper.find('h1').exists()).toBe(false);
      expect(wrapper.find('article').exists()).toBe(false);
      expect(router.currentRoute.value.name).toBe('key-result-detail');
      await wrapper.get('button').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe(`/goals/${goalId}`);
    },
  );

  it('loads Review create on refresh, validates reflection and saves into the canonical detail deep link', async () => {
    const first = await load('/goals/goal-1/review/create');
    first.wrapper.unmount();
    const { router, wrapper } = await load('/goals/goal-1/review/create');
    expect(calls.getGoalAggregateView).toHaveBeenCalledTimes(2);
    expect(calls.getGoalReviewContext).toHaveBeenNthCalledWith(2, 'goal-1', 7);
    expect(wrapper.get('article').text()).toContain('40%');
    const save = wrapper.findAll('button').find((button) => button.text() === 'Save review')!;
    expect(save.attributes('disabled')).toBeDefined();
    await wrapper.findAll('textarea')[0]!.setValue('   ');
    expect(save.attributes('disabled')).toBeDefined();
    await wrapper.findAll('textarea')[0]!.setValue('Steady progress');
    await wrapper.findAll('textarea')[1]!.setValue('  Rain  ');
    await save.trigger('click');
    await flushPromises();
    expect(calls.createReview).toHaveBeenCalledExactlyOnceWith('goal-1', {
      reflection: 'Steady progress',
      challenges: 'Rain',
      adjustments: null,
      windowDays: 7,
    });
    expect(router.currentRoute.value.fullPath).toBe('/goals/goal-1/review/review-1');
    expect(wrapper.text()).toContain('Steady progress');
  });

  it('retains the Review create draft on a failed save and navigates only after retry succeeds', async () => {
    calls.createReview.mockResolvedValueOnce(null);
    const { router, wrapper } = await load('/goals/goal-1/review/create');
    await wrapper.findAll('textarea')[0]!.setValue('Keep this reflection');
    const save = wrapper.findAll('button').find((button) => button.text() === 'Save review')!;
    await save.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('goal-review-create');
    expect(wrapper.findAll('textarea')[0]!.element.value).toBe('Keep this reflection');
    expect(save.attributes('disabled')).toBeUndefined();
    await save.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('goal-review-detail');
  });

  it('uses history back to leave Review create without saving', async () => {
    const { router, wrapper } = await load('/goals/goal-1');
    await router.push('/goals/goal-1/review/create');
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/goals/goal-1'));
    expect(calls.createReview).not.toHaveBeenCalled();
  });

  it('restores Review detail on direct load and refresh and closes to its owning Goal', async () => {
    for (let refresh = 0; refresh < 2; refresh++) {
      goalReviews.value = [];
      const { router, wrapper } = await load('/goals/goal-1/review/review-1');
      expect(calls.getGoalAggregateView).toHaveBeenLastCalledWith('goal-1');
      expect(wrapper.text()).toContain('Steady progress');
      expect(wrapper.text()).toContain('Walk indoors');
      expect(wrapper.text()).toContain('Authoritative progress snapshot');
      await wrapper.get('button').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe('/goals/goal-1');
      wrapper.unmount();
    }
  });

  it('keeps missing Review detail blank with a working Goal back action', async () => {
    const { router, wrapper } = await load('/goals/goal-1/review/missing-review');
    expect(wrapper.get('h1').text()).toBe('Goal review');
    expect(wrapper.find('article').exists()).toBe(false);
    expect(router.currentRoute.value.name).toBe('goal-review-detail');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/goals/goal-1');
  });
});
