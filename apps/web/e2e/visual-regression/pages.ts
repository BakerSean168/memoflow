import { bootstrapVisualApp } from './app-environment';
import { createApp, defineComponent, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { RoutineConfigurationSnapshotSchema } from '@memoflow/contracts/routine';
import { AIWorkflowRunViewSchema } from '@memoflow/contracts/ai';
import { fail, ok } from '@memoflow/contracts/result';
import * as keys from '@memoflow/app-vue/di/keys';
import { productionLocaleMessages } from '@memoflow/app-vue/locales/production-messages';
import { installServerStateRuntime } from '@memoflow/app-vue/platform/server-state';
import { providePanelWidth } from '@memoflow/app-vue/layouts/shell/usePanelWidth';
import { useAppShellStore } from '@memoflow/app-vue/layouts/shell/useAppShellStore';
import RoutineConfigurationView from '@memoflow/app-vue/modules/routine/views/RoutineConfigurationView.vue';
import NotificationListPage from '@memoflow/app-vue/modules/notification/views/NotificationListPage.vue';
import KnowledgeProjectionWorkspaceView from '@memoflow/app-vue/modules/repository/views/KnowledgeProjectionWorkspaceView.vue';
import UserSettingsView from '@memoflow/app-vue/modules/setting/views/UserSettingsView.vue';
import TaskManagementView from '@memoflow/app-vue/modules/task/views/TaskManagementView.vue';
import AppShell from '@memoflow/app-vue/layouts/shell/AppShell.vue';
import {
  template,
  instance,
} from '@memoflow/app-vue/modules/task/components/task-quick-test-fixtures';
import '../../src/styles/index.css';

const params = new URLSearchParams(location.search);
const { locale, profile } = bootstrapVisualApp(params);
const surface = params.get('surface') ?? 'routine';
const stamp = Date.parse('2026-09-30T09:00:00Z');
const routineSnapshot = RoutineConfigurationSnapshotSchema.parse({
  definitions: [
    {
      id: 'routine-1',
      name: 'Stand & Move / 起身活动',
      description: 'Move after focused work.',
      enabled: true,
      trigger: {
        type: 'WallClock',
        timingOwner: 'scheduler',
        localTime: '10:00',
        timeZone: 'UTC',
        recurrence: {
          startDate: '2026-09-30',
          frequency: 'daily',
          interval: 1,
          byWeekday: [],
          count: null,
          until: null,
        },
      },
      version: 1,
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    },
  ],
  profiles: [
    {
      id: 'profile-1',
      name: 'Work / 工作',
      description: null,
      enabled: true,
      active: true,
      version: 1,
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    },
  ],
  preferences: { globalEnabled: true, version: 0 },
  memberships: [{ routineId: 'routine-1', profileId: 'profile-1', enabled: true, version: 1 }],
  runtimeContext: { activeProfileIds: ['profile-1'] },
  capabilities: { localRuntime: false },
  overrides: [],
});
const note = {
  id: 'projection-1',
  connectionId: 'binding-1',
  knowledgeDocumentId: null,
  relativePath: 'notes/review.md',
  title: 'Review practice / 复盘实践',
  commitSha: 'b'.repeat(40),
  blobSha: 'c'.repeat(40),
  contentHash: 'd'.repeat(64),
  frontmatter: {},
  markdownContent:
    '# Review practice\n\nA read-only GitHub projection.\n\n## Weekly rhythm\n\n- Record measured outcomes\n- Review progress\n- Adjust the next plan',
  createdAt: stamp,
  updatedAt: stamp,
  deletedAt: null,
};
const binding = {
  id: 'binding-1',
  knowledgeSpaceId: 'space-1',
  identityId: 'visual',
  provider: 'GitHub',
  installationId: 'installation-1',
  repositoryId: 'repository-1',
  repositoryFullNameSnapshot: 'memoflow/knowledge',
  connectedAt: stamp,
  disconnectedAt: null,
  observation: {
    bindingId: 'binding-1',
    observedAt: stamp,
    accountId: '42',
    repositoryFullName: 'memoflow/knowledge',
    defaultBranch: 'main',
    private: true,
    archived: false,
    eligibility: { state: 'Ready' },
  },
  projectionCheckpoint: {
    bindingId: 'binding-1',
    targetCommitSha: 'b'.repeat(40),
    projectedCommitSha: 'b'.repeat(40),
    state: 'Ready',
    failure: null,
    lastAttemptAt: stamp,
    projectedAt: stamp,
  },
};
const repository = {
  listKnowledgeRepositoryConnections: async () => ok({ connections: [binding] }),
  listKnowledgeNoteProjections: async () => ok({ notes: [note], total: 1, nextCursor: null }),
  listKnowledgeNoteTree: async () =>
    ok({
      parent: '',
      nodes: [
        {
          kind: 'note',
          name: 'review',
          title: note.title,
          relativePath: note.relativePath,
          projectionId: note.id,
          knowledgeDocumentId: null,
          contentHash: note.contentHash,
          updatedAt: stamp,
        },
      ],
      metadata: { total: 1, visibleTotal: 1, hiddenNoteCount: 0, hiddenDirectories: [] },
    }),
  getKnowledgeNoteProjection: async () => ok(note),
  resolveKnowledgeNoteReference: async () => ok(note),
  listReferenceableKnowledgeDocuments: async () => ok({ documents: [] }),
};
const task = {
  listPlans: async () => ok({ plans: [{ toDTO: () => template }], total: 1 }),
  listOccurrencesByDateRange: async () => ok([{ toDTO: () => instance() }]),
  getPlan: async (id: string) =>
    id === String(template.id)
      ? ok({ id: template.id, toDTO: () => template })
      : fail({ code: 'NOT_FOUND', message: 'Fixture owner has not been created' }),
};
const notifications = [
  {
    id: 'notification-1',
    identityId: 'visual',
    title: 'Review your progress / 查看进度',
    content: 'Your weekly goal review is ready.',
    type: 'Info',
    category: 'Goal',
    isRead: false,
    isArchived: false,
    createdAt: stamp,
    updatedAt: stamp,
    actions: [],
    metadata: {},
    version: 1,
  },
];
const components = {
  routine: RoutineConfigurationView,
  notification: NotificationListPage,
  knowledge: KnowledgeProjectionWorkspaceView,
  settings: UserSettingsView,
};
const shell = surface.startsWith('shell') || surface === 'ai';
const router = createRouter({
  history: createMemoryHistory(),
  routes: shell
    ? [
        {
          path: '/',
          component: AppShell,
          children: [{ path: 'tasks', name: 'task-list', component: TaskManagementView }],
        },
      ]
    : [
        {
          path: '/:pathMatch(.*)*',
          component: components[surface as keyof typeof components] ?? RoutineConfigurationView,
        },
      ],
});
const pinia = createPinia();
const app = createApp(
  defineComponent({
    setup() {
      const { width } = providePanelWidth();
      width.value = Number(params.get('panelWidth'));
      return () =>
        h('main', { class: '@container/panel h-screen w-full bg-background text-foreground' }, [
          h(RouterView),
        ]);
    },
  }),
);
app
  .use(pinia)
  .use(router)
  .use(
    createI18n({
      legacy: false,
      locale,
      fallbackLocale: 'en-US',
      messages: productionLocaleMessages,
    }),
  );
installServerStateRuntime(app, 'web', { identityScope: 'visual-matrix' });
// Fixture doubles expose only supported reads; unexpected writes fail closed.
app.provide(keys.ROUTINE_SERVICE_KEY, {
  getConfigurationSnapshot: async () => ok(routineSnapshot),
} as never);
app.provide(keys.REPOSITORY_SERVICE_KEY, repository as never);
app.provide(keys.TASK_SERVICE_KEY, task as never);
app.provide(keys.GOAL_SERVICE_KEY, {
  listGoals: async () => ok({ goals: [], pagination: { hasMore: false } }),
} as never);
app.provide(keys.LABEL_SERVICE_KEY, { listLabels: async () => ok([]) } as never);
app.provide(keys.GOAL_KNOWLEDGE_SERVICE_KEY, {} as never);
app.provide(keys.NOTIFICATION_SERVICE_KEY, {
  findNotifications: async () => ok({ notifications, total: 1 }),
  getUnreadCount: async () => ok({ count: 1 }),
} as never);
app.provide(keys.SETTING_SERVICE_KEY, {
  getPreferenceProfile: async () => ok(profile),
  getPreferenceNamespace: async (namespace: 'presentation' | 'regional') =>
    ok({ namespace, preferences: profile[namespace], revision: 1 }),
} as never);
const nativeRun = AIWorkflowRunViewSchema.parse({
  runId: 'visual-run',
  conversationId: 'visual-conversation',
  kind: 'task.create',
  status: 'suspended',
  createdAt: stamp,
  updatedAt: stamp,
  suspension: {
    type: 'task_draft_review',
    revision: 1,
    ownerCreate: {
      taskId: 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001',
      draftRef: 'task:review',
    },
    draft: {
      revision: 1,
      task: {
        draftRef: 'task:review',
        title: 'Review measured progress',
        description: 'Plan drafted with AI; the Task owner owns editing and confirmation.',
        importance: 'Moderate',
        schedule: { kind: 'OneTime', date: '2026-10-02', timing: { kind: 'At', time: '09:00' } },
        reminderConfig: null,
        goalBinding: null,
        labels: [],
      },
      rationale: 'A bounded review practice.',
      warnings: [],
    },
    warnings: [],
  },
});
if (surface === 'ai') {
  localStorage.setItem(
    'ai:conversation-workflow-map:v3',
    JSON.stringify({ 'visual-conversation': { activeRunId: nativeRun.runId } }),
  );
  localStorage.setItem('ai:last-conversation-id', 'visual-conversation');
}
app.provide(keys.AI_CLIENT_KEY, {
  listProviders: async () => ok([]),
  listConversations: async () =>
    ok({
      data:
        surface === 'ai'
          ? [
              {
                id: 'visual-conversation',
                name: 'Native Task review',
                createdAt: stamp,
                updatedAt: stamp,
                metadata: { mode: 'task-create' },
              },
            ]
          : [],
    }),
} as never);
app.provide(keys.AI_ASSISTANT_RUNTIME_KEY, {
  listMessages: async () => ({ messages: [] }),
} as never);
app.provide(keys.AI_RUNTIME_USAGE_KEY, { get: async () => null } as never);
app.provide(keys.AI_WORKFLOW_RUNTIME_KEY, { get: async () => nativeRun } as never);
app.provide(keys.ASSISTANT_SURFACE_KEY, 'web');
const route = shell
  ? '/tasks'
  : surface === 'settings'
    ? '/settings?tab=appearance'
    : surface === 'knowledge'
      ? '/repository?note=projection-1'
      : '/routines';
await router.push(route);
await router.isReady();
if (shell) {
  const store = useAppShellStore(pinia);
  store.setSidebarCollapsed(true);
  store.setPanelWidth(surface === 'shell-split' ? 720 : 520);
  if (params.get('tabs') === '8') {
    for (let index = 0; index < 8; index++) {
      store.openTab({
        module: 'task',
        route: `/tasks?context=${index}`,
        title: `Task ${index}`,
        intent: 'deeplink',
      });
    }
  }
  if (surface === 'shell-focus') store.setLayout('focus', 'user');
}
app.mount('#app');
