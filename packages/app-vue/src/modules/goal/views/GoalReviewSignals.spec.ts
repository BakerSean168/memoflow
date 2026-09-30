import { DOMWrapper, enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { productionLocaleMessages } from '../../../locales/production-messages';
import { goalRoutes } from '../router';
import GoalDetailView from './GoalDetailView.vue';
import { createMockGoalMutationReceipt } from '@memoflow/contracts/mocks';

const calls = vi.hoisted(() => ({
  getGoalWorkspace: vi.fn(),
  getGoalReviewContext: vi.fn(),
}));
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
const goalReviews = ref<(typeof review)[]>([]);
vi.mock('../composables/useGoal', () => ({
  useGoal: () => ({}),
}));
vi.mock('../../../shared/composables/useLabelCatalog', () => ({
  useLabelCatalog: () => ({ options: ref([]), isLoading: ref(false), createLabel: vi.fn() }),
}));
enableAutoUnmount(afterEach);
beforeEach(() => {
  vi.clearAllMocks();
  goalReviews.value = [review];
  calls.getGoalWorkspace.mockImplementation(async () => ({
    ok: true,
    data: {
      goal: createMockGoalMutationReceipt({
        id: 'goal-1' as never,
        name: 'Walking goal',
        keyResults: [],
        labels: [],
        reminderConfig: null,
      }).readModel,
      taskContext: { availability: 'Unavailable', preview: [], summary: null },
      knowledgeContext: { availability: 'Unavailable', preview: [], summary: null },
      recentProgress: [],
      recentReviews: goalReviews.value,
    },
  }));
  calls.getGoalReviewContext.mockResolvedValue({ ok: true, data: context });
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
          component: ['goal-detail', 'goal-review-create', 'goal-review-detail'].includes(
            String(route.name),
          )
            ? GoalDetailView
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
      stubs: {
        GoalRecordDialog: true,
        KeyResultDialog: true,
        GoalKnowledgeMenuItems: true,
        GoalReminderMenuItems: true,
      },
      provide: {
        [GOAL_SERVICE_KEY as symbol]: calls,
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
        const snapshot = new DOMWrapper(
          document.querySelector<HTMLElement>('[data-testid="review-snapshot"]')!,
        );
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
        expect(document.body.innerHTML).not.toContain('private-kr-id');
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
    goalReviews.value = [{ ...review, systemContext: empty }];
    for (const url of ['/goals/goal-1/review/create', '/goals/goal-1/review/review-1']) {
      const { wrapper } = await load(url, locale);
      expect(document.body.textContent).toContain(
        locale === 'en-US' ? 'No measurement records in this window' : '此时间窗口内无测量记录',
      );
      expect(document.body.textContent).toContain(
        locale === 'en-US'
          ? '0 records · 0 manual · 0 task contributions'
          : '0 条记录 · 0 条手动记录 · 0 条任务贡献',
      );
      wrapper.unmount();
    }
  });
  it.each(['empty', 'absent'])(
    'old detail with %s signals shows facts without a context query',
    async (kind) => {
      const legacy = { ...review, systemContext: { ...context, signals: [] } };
      if (kind === 'absent') Reflect.deleteProperty(legacy.systemContext, 'signals');
      goalReviews.value = [legacy];
      await load('/goals/goal-1/review/review-1');
      expect(document.body.textContent).toContain('No signals were saved with this review');
      expect(document.body.textContent).toContain('30% → 40%');
      expect(calls.getGoalReviewContext).not.toHaveBeenCalled();
    },
  );
});
