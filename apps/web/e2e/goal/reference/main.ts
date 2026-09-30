import { faker } from '@faker-js/faker';
import { createApp, defineComponent, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import {
  createMockGoalMutationReceipt,
  createMockKeyResult,
  createMockGoalRecord,
} from '@memoflow/contracts/mocks';
import type {
  GoalReviewSystemContext,
  CreateGoalReq,
  CreateGoalReviewReq,
  CreateGoalRecordReq,
} from '@memoflow/contracts/goal';
import {
  GOAL_SERVICE_KEY,
  LABEL_SERVICE_KEY,
  GOAL_KNOWLEDGE_SERVICE_KEY,
} from '@memoflow/app-vue/di/keys';
import type {
  IGoalService,
  ILabelService,
  IGoalKnowledgeService,
} from '@memoflow/app-vue/di/types';
import { productionLocaleMessages } from '@memoflow/app-vue/locales/production-messages';
import { installServerStateRuntime } from '@memoflow/app-vue/platform/server-state';
import { setProductTimePreferences } from '@memoflow/app-vue/shared/utils/product-time';
import { DEFAULT_USER_PREFERENCE_PROFILE } from '@memoflow/contracts/setting';
import GoalDetailView from '@memoflow/app-vue/modules/goal/views/GoalDetailView.vue';
import GoalDialog from '@memoflow/app-vue/modules/goal/components/dialogs/GoalDialog.vue';
import { goalRoutes } from '@memoflow/app-vue/modules/goal/router';
import '../../../../../apps/web/src/styles/index.css';

const { previewGoalRecord } = await import('@memoflow/goal/client');
faker.seed(1601);
const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US';
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark');
setProductTimePreferences({
  ...DEFAULT_USER_PREFERENCE_PROFILE,
  presentation: { ...DEFAULT_USER_PREFERENCE_PROFILE.presentation, language: locale },
  regional: { ...DEFAULT_USER_PREFERENCE_PROFILE.regional, timeZone: 'America/Los_Angeles' },
});
const methods = ['Sum', 'Last', 'Max', 'Min', 'Average'] as const;
let goal = createMockGoalMutationReceipt({
  id: 'goal-reference' as never,
  name: 'Goal reference',
  summary: 'Direction → measurement → reflection',
  description: 'Isolated production components; deterministic service doubles; AI absent.',
  status: 'InProgress',
  version: 1,
  labels: [],
  reminderConfig: null,
  start: { kind: 'day', date: '2026-09-01' as never },
  target: { kind: 'day', date: '2026-09-29' as never },
  keyResults:
    params.get('state') === 'empty'
      ? []
      : methods.map((method, index) =>
          createMockKeyResult({
            id: `kr-${index}` as never,
            title: `${method} outcome`,
            description: 'Observed measurement',
            weight: 1,
            progress: {
              aggregationMethod: method,
              initialValue: 0,
              currentValue: 4,
              targetValue: 10,
              unit: 'km',
            },
            progressPercentage: 40,
            target: null,
          }),
        ),
  reviews: [],
}).readModel;
const calls: string[] = [];
const ok = <T>(data: T) => ({ ok: true as const, data });
const context: GoalReviewSystemContext = {
  windowStartAt: Date.parse('2026-09-01T00:00:00Z'),
  windowEndAt: Date.parse('2026-09-30T12:00:00Z'),
  signals: [],
  overallProgress: { startPercentage: 0, endPercentage: 40, deltaPercentage: 40 },
  summary: { recordCount: 1, manualRecordCount: 1, taskContributionCount: 0 },
  keyResults: [],
};
function receipt(extra = {}) {
  return createMockGoalMutationReceipt(goal, extra);
}
function previewContext() {
  return {
    ...goal.keyResults[0]!.progress,
    keyResultId: goal.keyResults[0]!.id,
    trackingBaseValue: 0,
    aggregationSnapshot: { count: 1, sum: 4, min: 4, max: 4, last: 4 },
  };
}
// Deliberately partial ports: unimplemented operations must fail, rather than fake success.
const service = {
  async getGoalWorkspace() {
    calls.push('workspace');
    return ok({
      goal,
      taskContext: { availability: 'Unavailable', preview: [], summary: null },
      knowledgeContext: { availability: 'Unavailable', preview: [], summary: null },
      recentProgress: [],
      recentReviews: goal.reviews,
    });
  },
  async getGoalAggregateView() {
    calls.push('aggregate');
    return ok({ goal, keyResults: goal.keyResults, reviews: goal.reviews, records: [] });
  },
  async getGoalRecordsByKeyResult() {
    calls.push('records');
    return ok({ records: [], total: 0, previewContext: previewContext() });
  },
  async createGoal(request: CreateGoalReq) {
    calls.push('create');
    goal = createMockGoalMutationReceipt({
      ...goal,
      name: request.name,
      status: 'Planned',
      summary: request.summary ?? null,
      description: request.description ?? null,
      start: request.start ?? null,
      target: request.target ?? null,
      keyResults:
        request.initialKeyResults?.map((kr, index) =>
          createMockKeyResult({
            id: `kr-${index}` as never,
            title: kr.title,
            progress: {
              aggregationMethod: kr.calculationMethod,
              initialValue: kr.initialValue,
              currentValue: kr.currentValue,
              targetValue: kr.targetValue,
              unit: kr.unit,
            },
          }),
        ) ?? [],
    }).readModel;
    return ok(receipt());
  },
  async createGoalRecord(_goalId: string, _krId: string, request: CreateGoalRecordReq) {
    calls.push('record');
    const after = previewGoalRecord(previewContext(), request.value);
    goal = {
      ...goal,
      version: goal.version + 1,
      keyResults: goal.keyResults.map((kr, index) =>
        index
          ? kr
          : {
              ...kr,
              progress: { ...kr.progress, currentValue: after.after },
              progressPercentage: after.afterPercentage,
            },
      ),
    };
    const record = createMockGoalRecord({
      goalId: goal.id,
      keyResultId: goal.keyResults[0]!.id,
      value: request.value,
      comment: request.note,
      authorship: 'Manual',
    });
    return ok(receipt({ recordChanges: { upserted: [record], removedIds: [] } }));
  },
  async getGoalReviewContext() {
    calls.push('review-context');
    return ok(context);
  },
  async createGoalReview(_id: string, request: CreateGoalReviewReq) {
    calls.push('review');
    const review = {
      id: `review-${goal.reviews.length + 1}`,
      goalId: goal.id,
      reviewedAt: context.windowEndAt,
      reflection: request.reflection,
      challenges: request.challenges,
      adjustments: request.adjustments,
      systemContext: { ...context },
    };
    goal = createMockGoalMutationReceipt({
      ...goal,
      version: goal.version + 1,
      reviews: [...goal.reviews, review as never],
    }).readModel;
    context.windowStartAt = context.windowEndAt;
    return ok(
      receipt({
        affectedEntityIds: {
          goalIds: [goal.id],
          keyResultIds: [],
          recordIds: [],
          reviewIds: [review.id],
        },
      }),
    );
  },
  async getGoalReviews() {
    calls.push('reviews');
    return ok({ reviews: goal.reviews.map((review) => ({ toDTO: () => review })) });
  },
} as unknown as IGoalService;
const parent = goalRoutes[0]!;
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      ...parent,
      component: RouterView,
      children: parent.children!.map((route) => ({ ...route, component: GoalDetailView })),
    },
  ],
});
const creating = ref(params.get('state') === 'create');
const app = createApp(
  defineComponent({
    setup: () => () =>
      h('main', { class: '@container/panel h-screen w-full' }, [
        creating.value ? null : h(RouterView),
        h(GoalDialog, {
          open: creating.value,
          'onUpdate:open': (open: boolean) => {
            creating.value = open;
          },
          onCreated: async () => {
            creating.value = false;
            await router.replace('/goals/goal-reference');
          },
        }),
      ]),
  }),
);
app
  .use(createPinia())
  .use(router)
  .use(createI18n({ legacy: false, locale, messages: productionLocaleMessages }));
installServerStateRuntime(app, 'web', { identityScope: 'goal-reference' });
app.provide(GOAL_SERVICE_KEY, service);
app.provide(LABEL_SERVICE_KEY, { listLabels: async () => ok([]) } as unknown as ILabelService);
app.provide(GOAL_KNOWLEDGE_SERVICE_KEY, {} as IGoalKnowledgeService);
await router.push(
  params.get('state') === 'review'
    ? '/goals/goal-reference/review/create'
    : '/goals/goal-reference',
);
await router.isReady();
app.mount('#app');
// Read-only diagnostics for acceptance assertions; no browser-side state manipulation.
Object.assign(window, { goalReferenceEvidence: () => ({ calls: [...calls], goal }) });
