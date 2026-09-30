import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { productionLocaleMessages } from '../../../locales/production-messages';
import { goalRoutes } from '../router';
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
  windowStartAt: 1,
  windowEndAt: 2,
  signals: [
    {
      kind: 'overall-movement',
      direction: 'decreased',
      evidence: { startPercentage: 80, endPercentage: 60, deltaPercentage: -20 },
    },
    {
      kind: 'key-result-movement',
      evidence: [
        {
          keyResultId: 'private-kr-id',
          title: 'Distance',
          direction: 'improved',
          startPercentage: 30,
          endPercentage: 40,
          deltaPercentage: 10,
        },
      ],
    },
    {
      kind: 'measurement-activity',
      evidence: { recordCount: 3, manualRecordCount: 2, taskContributionCount: 1 },
    },
  ],
  overallProgress: { startPercentage: 30, endPercentage: 40, deltaPercentage: 10 },
  summary: { recordCount: 3, manualRecordCount: 2, taskContributionCount: 1 },
  keyResults: [
    {
      keyResultId: 'kr-1',
      title: 'Distance',
      unit: 'km',
      deltaPercentage: 10,
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

async function load(url: string, locale = 'en-US') {
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
            route.name === 'goal-review-create'
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
      plugins: [router, createI18n({ legacy: false, locale, messages: productionLocaleMessages })],
      provide: {
        [GOAL_SERVICE_KEY as symbol]: { getGoalReviewContext: calls.getGoalReviewContext },
      },
    },
  });
  await flushPromises();
  return { router, wrapper };
}

describe('Review deterministic signals without an AI provider', () => {
  it.each(['en-US', 'zh-CN'])(
    'create and detail show server/persisted evidence in %s',
    async (locale) => {
      for (const url of ['/goals/goal-1/review/create', '/goals/goal-1/review/review-1']) {
        const { wrapper } = await load(url, locale);
        const snapshot = wrapper.get('[data-testid="review-snapshot"]');
        const signals = snapshot.get('[data-testid="review-signals"]').text();
        expect(snapshot.text()).toContain('30% → 40%');
        expect(signals).toContain('80% → 60%');
        expect(signals).toContain('-20');
        expect(signals).toContain(
          locale === 'en-US' ? 'Overall progress decreased' : '总体进度下降',
        );
        expect(signals).toContain(
          locale === 'en-US'
            ? '3 records · 2 manual · 1 task contributions'
            : '3 条记录 · 2 条手动记录 · 1 条任务贡献',
        );
        expect(signals).toContain(
          locale === 'en-US' ? 'Progress toward target increased' : '向目标的进度上升',
        );
        expect(wrapper.html()).not.toContain('private-kr-id');
        wrapper.unmount();
      }
    },
  );
  it.each(['en-US', 'zh-CN'])('zero activity remains informative in %s', async (locale) => {
    const empty = {
      ...context,
      summary: { recordCount: 0, manualRecordCount: 0, taskContributionCount: 0 },
      signals: [
        {
          kind: 'measurement-activity',
          evidence: { recordCount: 0, manualRecordCount: 0, taskContributionCount: 0 },
        },
      ],
    };
    calls.getGoalReviewContext.mockResolvedValueOnce({ ok: true, data: empty });
    calls.getGoalAggregateView.mockImplementation(async () => {
      goalReviews.value = [{ ...review, systemContext: empty }];
    });
    for (const url of ['/goals/goal-1/review/create', '/goals/goal-1/review/review-1']) {
      const { wrapper } = await load(url, locale);
      expect(wrapper.text()).toContain(
        locale === 'en-US' ? 'No measurement records in this window' : '此时间窗口内无测量记录',
      );
      expect(wrapper.text()).toContain(
        locale === 'en-US'
          ? '0 records · 0 manual · 0 task contributions'
          : '0 条记录 · 0 条手动记录 · 0 条任务贡献',
      );
      wrapper.unmount();
    }
  });
  it('old detail shows facts and explains absent saved signals without a context query', async () => {
    calls.getGoalAggregateView.mockImplementation(async () => {
      goalReviews.value = [{ ...review, systemContext: { ...context, signals: [] } }];
    });
    const { wrapper } = await load('/goals/goal-1/review/review-1');
    expect(wrapper.text()).toContain('No signals were saved with this review');
    expect(wrapper.text()).toContain('30% → 40%');
    expect(calls.getGoalReviewContext).not.toHaveBeenCalled();
  });
});
