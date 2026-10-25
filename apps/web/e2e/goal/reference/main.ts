import GlobalConfirmDialog from '@memoflow/app-vue/shared/components/GlobalConfirmDialog.vue';
import { bootstrapVisualApp } from '../../visual-regression/app-environment';
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
import GoalModuleLayout from '@memoflow/app-vue/modules/goal/views/GoalModuleLayout.vue';
import GoalListView from '@memoflow/app-vue/modules/goal/views/GoalListView.vue';
import GoalDetailView from '@memoflow/app-vue/modules/goal/views/GoalDetailView.vue';
import GoalDialog from '@memoflow/app-vue/modules/goal/components/dialogs/GoalDialog.vue';
import type { GoalNativeEditSession } from '@memoflow/app-vue/modules/goal/composables/goalNativeEditSession';
import { goalRoutes } from '@memoflow/app-vue/modules/goal/router';
import '../../../../../apps/web/src/styles/index.css';

const { previewGoalRecord } = await import('@memoflow/goal-client');
faker.seed(1601);
const params = new URLSearchParams(location.search);
const { locale } = bootstrapVisualApp(params, 'America/Los_Angeles');
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
  async listGoals() {
    return ok({ goals: [{ toDTO: () => goal }], pagination: { hasMore: false, total: 1 } });
  },
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
              currentValue: kr.currentValue ?? kr.initialValue,
              targetValue: kr.targetValue,
              unit: kr.unit ?? null,
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
      path: parent.path,
      name: parent.name,
      meta: parent.meta,
      component: params.get('surface') === 'collection' ? GoalModuleLayout : RouterView,
      children: parent.children!.map((route) => ({
        path: route.path,
        name: route.name,
        meta: route.meta,
        component:
          params.get('surface') === 'collection' && route.name === 'goal-list'
            ? GoalListView
            : GoalDetailView,
      })),
    },
  ],
});
const creating = ref(params.get('state') === 'create');
const panel = params.get('surface') === 'panel';
let controlledSession: GoalNativeEditSession | null = null;
const commandResult = ref('');
function receiveSession(session: GoalNativeEditSession | null) {
  if (!session || !panel || params.get('control') !== 'ai') return;
  controlledSession = session.claimControl('browser-workflow-run');
  controlledSession.patch({ name: 'AI draft', description: 'Initial business command' });
}
function applyPanelCommand() {
  controlledSession?.patch({
    name: 'Updated by owner command',
    description: 'Actual batch patch result',
  });
  commandResult.value = 'Applied';
}
function releasePanelControl() {
  controlledSession?.releaseControl();
  controlledSession = null;
  commandResult.value = 'Handed off without saving';
}
function renderGoalEditor() {
  return h(GoalDialog, {
    open: creating.value,
    presentation: panel ? 'panel' : 'dialog',
    onSessionChange: receiveSession,
    'onUpdate:open': (open: boolean) => {
      creating.value = open;
    },
    onCreated: async () => {
      creating.value = false;
      await router.replace('/goals/goal-reference');
    },
  });
}

function renderReferenceChat() {
  return h(
    'aside',
    {
      class:
        'flex h-full w-[44%] shrink-0 flex-col gap-3 border-r border-border/50 bg-background p-5',
      'data-testid': 'reference-chat-column',
    },
    [
      h('p', { class: 'text-sm font-semibold' }, 'AI Chat'),
      h(
        'p',
        { class: 'text-xs text-muted-foreground' },
        'Chat remains operable while the Goal editor is open.',
      ),
      params.get('control') === 'ai'
        ? h('div', { class: 'flex flex-col gap-2' }, [
            h(
              'button',
              {
                class: 'rounded border p-2 text-left',
                'data-testid': 'business-patch',
                onClick: applyPanelCommand,
              },
              'Apply business command',
            ),
            h(
              'button',
              {
                class: 'rounded border p-2 text-left',
                'data-testid': 'business-handoff',
                onClick: releasePanelControl,
              },
              'Hand off',
            ),
            h(
              'p',
              { role: 'status', 'data-testid': 'business-command-result' },
              commandResult.value,
            ),
          ])
        : null,
      h('textarea', {
        'data-testid': 'reference-chat-composer',
        class:
          'mt-auto min-h-20 w-full resize-none rounded-lg border border-border/70 bg-background p-3 text-sm',
        placeholder: 'Ask the AI...',
      }),
    ],
  );
}

function renderReferenceBusinessPanel() {
  return h(
    'div',
    {
      class:
        'relative isolate @container/panel h-full min-w-0 flex-1 overflow-hidden bg-background',
      'data-testid': 'reference-business-pane',
    },
    [
      h(
        'div',
        { class: 'flex h-full w-full flex-col', 'data-testid': 'reference-goal-background' },
        [
          h(
            'header',
            { class: 'shrink-0 border-b border-border/60 px-5 py-3 text-sm font-medium' },
            'Goals',
          ),
          h('div', { class: 'flex flex-col gap-3 p-5 text-sm text-muted-foreground' }, [
            h('p', 'Goals currently in progress'),
            h('p', 'Study plan'),
            h('p', 'Personal development'),
            h('p', 'Learning and practice'),
          ]),
        ],
      ),
      renderGoalEditor(),
    ],
  );
}

const app = createApp(
  defineComponent({
    setup: () => () =>
      panel
        ? h('main', { class: 'flex h-screen w-full overflow-hidden' }, [
            renderReferenceChat(),
            renderReferenceBusinessPanel(),
          ])
        : h('main', { class: '@container/panel h-screen w-full' }, [
            creating.value ? null : h(RouterView),
            renderGoalEditor(),
            h(GlobalConfirmDialog),
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
  params.get('surface') === 'collection'
    ? '/goals'
    : params.get('state') === 'review'
      ? '/goals/goal-reference/review/create'
      : '/goals/goal-reference',
);
await router.isReady();
app.mount('#app');
// Read-only diagnostics for acceptance assertions; no browser-side state manipulation.
Object.assign(window, { goalReferenceEvidence: () => ({ calls: [...calls], goal }) });
