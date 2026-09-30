import { faker } from '@faker-js/faker';
import { createApp, defineComponent, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { createMockGoalMutationReceipt, createMockKeyResult } from '@memoflow/contracts/mocks';
import type { UpdateTaskPlanReq, TaskPlanClientDTO } from '@memoflow/contracts/task';
import { GOAL_SERVICE_KEY, LABEL_SERVICE_KEY, TASK_SERVICE_KEY } from '@memoflow/app-vue/di/keys';
import type { IGoalService, ILabelService, ITaskService } from '@memoflow/app-vue/di/types';
import { productionLocaleMessages } from '@memoflow/app-vue/locales/production-messages';
import { installServerStateRuntime } from '@memoflow/app-vue/platform/server-state';
import { setProductTimePreferences } from '@memoflow/app-vue/shared/utils/product-time';
import { DEFAULT_USER_PREFERENCE_PROFILE } from '@memoflow/contracts/setting';
import TaskDetailView from '@memoflow/app-vue/modules/task/views/TaskDetailView.vue';
import TaskPlanDialog from '@memoflow/app-vue/modules/task/components/dialogs/TaskPlanDialog.vue';
import {
  template,
  instance,
} from '@memoflow/app-vue/modules/task/components/task-quick-test-fixtures';
import '../../../../../apps/web/src/styles/index.css';

faker.seed(3101);
const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US';
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark');
setProductTimePreferences({
  ...DEFAULT_USER_PREFERENCE_PROFILE,
  presentation: { ...DEFAULT_USER_PREFERENCE_PROFILE.presentation, language: locale },
  regional: { ...DEFAULT_USER_PREFERENCE_PROFILE.regional, timeZone: 'UTC' },
});
const labels = [
  { id: 'label-1', name: 'Focus / 专注', color: '#5588aa' },
  { id: 'label-2', name: 'Weekly review / 每周回顾', color: '#aa8855' },
];
const goal = createMockGoalMutationReceipt({
  id: 'goal-reference' as never,
  name: 'Build a sustainable review practice / 建立复盘习惯',
  keyResults: [
    createMockKeyResult({ id: 'kr-reference' as never, title: 'Measured reviews / 复盘次数' }),
  ],
}).readModel;
const populated = params.get('state') !== 'empty';
let plan: TaskPlanClientDTO = {
  ...template,
  description: 'Plan settings govern future occurrences; each occurrence keeps its own outcome.',
  labels: populated ? (labels as TaskPlanClientDTO['labels']) : [],
  goalBinding: populated
    ? {
        goalId: goal.id,
        keyResultId: goal.keyResults[0]!.id,
        progressRule: { mode: 'Prompt', trigger: 'EachCompletion', suggestedValue: 1 },
        contribution: null,
      }
    : null,
  reminderConfig: populated
    ? {
        enabled: true,
        triggers: [
          { type: 'Relative', relativeValue: 15, relativeUnit: 'Minutes', absoluteTime: null },
          { type: 'Relative', relativeValue: 1, relativeUnit: 'Hours', absoluteTime: null },
        ],
      }
    : null,
  archivedAt: params.get('state') === 'archived' ? Date.parse('2026-09-29T00:00:00Z') : null,
};
const calls: UpdateTaskPlanReq[] = [];
const ok = <T>(data: T) => ({ ok: true as const, data });
// Partial injected ports: unexpected operations fail instead of pretending success.
const taskService = {
  async getWorkspace() {
    return ok({
      plan,
      labels: plan.labels,
      goalContext: plan.goalBinding
        ? {
            availability: params.get('owner') === 'missing' ? 'Missing' : 'Available',
            goalId: goal.id,
            keyResultId: goal.keyResults[0]!.id,
            goal: params.get('owner') === 'missing' ? null : goal,
            keyResult: params.get('owner') === 'missing' ? null : goal.keyResults[0],
          }
        : null,
      occurrenceSummary: {
        total: 1,
        pending: 1,
        completed: 0,
        missed: 0,
        skipped: 0,
        inProgress: 0,
        completionRate: 0,
      },
      recentOccurrences: [instance()],
      linkedNotes: [],
    });
  },
  async updatePlan(_id: string, request: UpdateTaskPlanReq) {
    calls.push(structuredClone(request));
    if (params.get('busy') === 'true') await new Promise((resolve) => setTimeout(resolve, 1500));
    plan = {
      ...plan,
      ...request,
      labels: request.labelIds
        ? (labels.filter((label) =>
            request.labelIds!.includes(label.id as never),
          ) as TaskPlanClientDTO['labels'])
        : plan.labels,
      version: plan.version + 1,
    } as TaskPlanClientDTO;
    return ok({ toDTO: () => plan });
  },
} as unknown as ITaskService;
const goalService = {
  async listGoals() {
    return ok({ goals: [goal], pagination: { hasMore: false } });
  },
  async getGoalAggregateView() {
    return ok({ goal, keyResults: goal.keyResults, reviews: [], records: [] });
  },
} as unknown as IGoalService;
const labelService = {
  async listLabels() {
    return ok(labels);
  },
} as unknown as ILabelService;
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/tasks/:id', name: 'task-detail', component: TaskDetailView },
    {
      path: '/goals/:id',
      name: 'goal-detail',
      component: defineComponent({
        render: () => h('p', { 'data-testid': 'goal-owner-destination' }, 'Goal owner destination'),
      }),
    },
    {
      path: '/tasks',
      name: 'task-list',
      component: defineComponent({ render: () => h('p', 'Task list') }),
    },
  ],
});
const creating = ref(params.get('state') === 'create');
const app = createApp(
  defineComponent({
    setup: () => () =>
      h('main', { class: '@container/panel h-screen w-full' }, [
        creating.value ? null : h(RouterView),
        h(TaskPlanDialog, {
          modelValue: creating.value,
          'onUpdate:modelValue': (open: boolean) => {
            creating.value = open;
          },
        }),
      ]),
  }),
);
app
  .use(createPinia())
  .use(router)
  .use(createI18n({ legacy: false, locale, messages: productionLocaleMessages }));
installServerStateRuntime(app, 'web', { identityScope: 'task-visual-grammar' });
app.provide(TASK_SERVICE_KEY, taskService);
app.provide(GOAL_SERVICE_KEY, goalService);
app.provide(LABEL_SERVICE_KEY, labelService);
await router.push('/tasks/plan-1');
await router.isReady();
app.mount('#app');
Object.assign(window, {
  taskGrammarEvidence: () => ({
    calls: structuredClone(calls),
    route: router.currentRoute.value.name,
  }),
});
