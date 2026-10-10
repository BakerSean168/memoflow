import { flushPromises, shallowMount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIWorkflowRunView, AssistantRuntimeChoice } from '@memoflow/contracts/ai';
import AIChatView from '../views/AIChatView.vue';
import { useAppShellStore } from '../../../layouts/shell/useAppShellStore';
import { SHELL_COMPOSER_MOUNT_KEY } from '../../../di/keys';

const fixture = await vi.hoisted(async () => {
  const { ref, computed } = await import('vue');
  const goalRun = ref<AIWorkflowRunView | null>(null);
  const taskRun = ref<AIWorkflowRunView | null>(null);
  const knowledgeRun = ref<AIWorkflowRunView | null>(null);
  const openGoal = vi.fn();
  const openTask = vi.fn();
  const openKnowledge = vi.fn();
  const session = {
    runtimeChoice: ref<AssistantRuntimeChoice>({ runtimeKind: 'builtin' }),
    historyIncomplete: ref(false),
    chatMessage: ref(''),
    chatTimeline: ref([]),
    chatLoading: ref(false),
    chatConversationId: ref<string | null>(null),
    conversationTitle: ref(''),
    conversationList: ref([]),
    conversationListLoading: ref(false),
    lastActiveConversationId: ref(''),
    messagesViewport: ref(null),
    setSurfaceContextEntity: vi.fn(),
    abortActiveStream: vi.fn(),
    scrollMessagesToBottom: vi.fn(),
    selectConversation: vi.fn(async (item: { id: string }) => {
      session.chatConversationId.value = item.id;
    }),
    startNewConversation: vi.fn(() => {
      session.chatConversationId.value = null;
    }),
    loadConversationList: vi.fn(),
  };
  return {
    getRun: vi.fn(),
    session,
    openGoal,
    openTask,
    openKnowledge,
    goal: {
      goalWorkflowRun: goalRun,
      goalWorkflowStage: ref('collect'),
      goalAgentResuming: ref(false),
      goalOwnerAttemptPending: ref(false),
      clarificationAnswers: ref([]),
      editableTasks: ref([]),
      editableKnowledge: ref([]),
      automatedGoalId: computed(() =>
        goalRun.value?.kind === 'goal.create'
          ? (goalRun.value.result?.referenceMap.goal ?? null)
          : null,
      ),
      projectRun: vi.fn(async (run: AIWorkflowRunView) => {
        goalRun.value = run;
      }),
      resetGoalArtifacts: vi.fn(() => {
        goalRun.value = null;
      }),
      openGoalNativeReview: openGoal,
    },
    task: {
      taskWorkflowRun: taskRun,
      taskAgentResuming: ref(false),
      taskOwnerAttemptPending: ref(false),
      projectRun: vi.fn(async (run: AIWorkflowRunView) => {
        taskRun.value = run;
      }),
      resetTaskWorkflowLocalState: vi.fn(() => {
        taskRun.value = null;
      }),
      openTaskNativeReview: openTask,
    },
    knowledge: {
      knowledgeCaptureRun: knowledgeRun,
      knowledgeCaptureResuming: ref(false),
      projectRun: vi.fn(async (run: AIWorkflowRunView) => {
        knowledgeRun.value = run;
      }),
      resetKnowledgeCaptureLocalState: vi.fn(() => {
        knowledgeRun.value = null;
      }),
      openKnowledgeNativeReview: openKnowledge,
    },
  };
});

vi.mock('./useAI', async () => {
  const { ref } = await import('vue');
  return { useAI: () => ({ service: {}, providers: ref([]), loadProviders: vi.fn() }) };
});
vi.mock('../../goal/composables/useGoal', async () => {
  const { ref } = await import('vue');
  return { useGoal: () => ({ goals: ref([]), fetchGoals: vi.fn() }) };
});
vi.mock('../../task/composables/useTask', async () => {
  const { ref } = await import('vue');
  return { useTask: () => ({ templates: ref([]), fetchTemplates: vi.fn() }) };
});
vi.mock('../../repository/composables/useRecentKnowledgeNotes', async () => {
  const { ref } = await import('vue');
  return { useRecentKnowledgeNotes: () => ({ notes: ref([]), load: vi.fn() }) };
});
vi.mock('../../repository/composables/useReferenceableKnowledgeNotes', async () => {
  const { ref } = await import('vue');
  return {
    useReferenceableKnowledgeNotes: () => ({ notes: ref([]), load: vi.fn(), cancel: vi.fn() }),
  };
});
vi.mock('../../../shared/utils/useStrictInject', () => ({
  useStrictInject: () => ({ get: fixture.getRun }),
}));
vi.mock('./useAIChatSession', () => ({ useAIChatSession: () => fixture.session }));
vi.mock('./useAIGoalWorkflow', () => ({ useAIGoalWorkflow: () => fixture.goal }));
vi.mock('./useAITaskWorkflow', () => ({ useAITaskWorkflow: () => fixture.task }));
vi.mock('./useAIKnowledgeCapture', () => ({ useAIKnowledgeCapture: () => fixture.knowledge }));
vi.mock('./useAIKnowledgeQaWorkflow', () => ({
  useAIKnowledgeQaWorkflow: () => ({ resetKnowledgeAnswer: vi.fn() }),
}));
vi.mock('./chatViewHelpers', async (original) => ({
  ...(await original<typeof import('./chatViewHelpers')>()),
  initializeChatView: vi.fn(),
}));

const disposeViews: Array<() => void> = [];
const initialConfirm = window.confirm;
afterEach(() => {
  disposeViews.splice(0).forEach((dispose) => dispose());
  window.confirm = initialConfirm;
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/goals/:id', component: { template: '<div />' } }],
  });
  await router.push('/goals/current-goal');
  const pinia = createPinia();
  const wrapper = shallowMount(AIChatView, {
    props: { composerOnly: true },
    global: {
      plugins: [
        pinia,
        router,
        createI18n({
          legacy: false,
          locale: 'en',
          messages: { en: {} },
          missingWarn: false,
          fallbackWarn: false,
        }),
      ],
      provide: { [SHELL_COMPOSER_MOUNT_KEY as symbol]: { value: null } },
    },
  });
  disposeViews.push(() => wrapper.unmount());
  const shell = useAppShellStore(pinia);
  shell.openTab({
    module: 'goal',
    route: '/goals/current-goal',
    title: 'Current Goal',
    intent: 'deeplink',
  });
  return { wrapper, router, shell };
}

describe('AI conversation restoration and business navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.goal.goalWorkflowRun.value = null;
    fixture.task.taskWorkflowRun.value = null;
    fixture.knowledge.knowledgeCaptureRun.value = null;
    fixture.session.chatConversationId.value = null;
    fixture.session.runtimeChoice.value = { runtimeKind: 'builtin' };
  });

  it('keeps the conversation and composer draft when changing the same Agent model', async () => {
    const { wrapper } = await mountView();
    fixture.session.runtimeChoice.value = {
      runtimeKind: 'local_agent',
      connectionId: 'agent-one',
      modelId: 'old',
    };
    fixture.session.chatConversationId.value = 'native-conversation';
    fixture.session.chatMessage.value = 'Keep my draft';
    await wrapper.vm.localAssistant.select({
      runtimeKind: 'local_agent',
      connectionId: 'agent-one',
      modelId: 'new',
    });
    expect(fixture.session.startNewConversation).not.toHaveBeenCalled();
    expect(fixture.session.chatConversationId.value).toBe('native-conversation');
    expect(fixture.session.chatMessage.value).toBe('Keep my draft');
    expect(fixture.session.runtimeChoice.value.modelId).toBe('new');
    await wrapper.vm.localAssistant.select({
      runtimeKind: 'local_agent',
      connectionId: 'agent-two',
      modelId: 'new',
    });
    expect(fixture.session.startNewConversation).toHaveBeenCalledOnce();
  });

  it.each(['goal.create', 'task.create', 'knowledge.capture'] as const)(
    'restores %s history without opening its native business review',
    async (kind) => {
      localStorage.setItem(
        'ai:conversation-workflow-map:v3',
        JSON.stringify({ 'history-conversation': { activeRunId: 'history-run' } }),
      );
      fixture.getRun.mockResolvedValue({
        runId: 'history-run',
        conversationId: 'history-conversation',
        kind,
        status: 'suspended',
        createdAt: 1,
        updatedAt: 2,
      });
      const { wrapper, router, shell } = await mountView();
      const before = JSON.stringify(shell.$state);
      await wrapper.vm.selectConversation({ id: 'history-conversation', name: 'History' });
      await flushPromises();
      expect(fixture.getRun).toHaveBeenCalledWith({ runId: 'history-run' });
      const workflow =
        kind === 'goal.create'
          ? fixture.goal
          : kind === 'task.create'
            ? fixture.task
            : fixture.knowledge;
      expect(workflow.projectRun).toHaveBeenCalledWith(
        expect.objectContaining({ kind, runId: 'history-run' }),
        false,
      );
      expect(fixture.session.chatConversationId.value).toBe('history-conversation');
      expect(fixture.openGoal).not.toHaveBeenCalled();
      expect(fixture.openTask).not.toHaveBeenCalled();
      expect(fixture.openKnowledge).not.toHaveBeenCalled();
      expect(router.currentRoute.value.fullPath).toBe('/goals/current-goal');
      expect(JSON.stringify(shell.$state)).toBe(before);
      wrapper.unmount();
    },
  );

  it.each(
    (['select', 'new'] as const).flatMap((action) =>
      (['chat', 'knowledge-qa'] as const).map((mode) => ({ action, mode })),
    ),
  )(
    'allows $mode conversation $action beside an unsaved business form',
    async ({ action, mode }) => {
      const { wrapper, shell } = await mountView();
      wrapper.vm.startNewConversation(mode);
      fixture.session.startNewConversation.mockClear();
      shell.setSurfaceStatus('dirty');
      const before = JSON.stringify(shell.$state);
      const originalConfirm = window.confirm;
      const confirm = vi.fn(() => false);
      window.confirm = confirm;
      if (action === 'select') await wrapper.vm.selectConversation({ id: 'chat-b', name: 'B' });
      else wrapper.vm.startNewConversation();
      expect(confirm).not.toHaveBeenCalled();
      if (action === 'select') expect(fixture.session.chatConversationId.value).toBe('chat-b');
      else expect(fixture.session.startNewConversation).toHaveBeenCalled();
      expect(JSON.stringify(shell.$state)).toBe(before);
      window.confirm = originalConfirm;
      wrapper.unmount();
    },
  );

  it('retains the existing native Workflow review leave protection', async () => {
    localStorage.setItem(
      'ai:conversation-workflow-map:v3',
      JSON.stringify({ 'review-conversation': { activeRunId: 'review-run' } }),
    );
    fixture.getRun.mockResolvedValue({
      runId: 'review-run',
      conversationId: 'review-conversation',
      kind: 'goal.create',
      status: 'suspended',
      createdAt: 1,
      updatedAt: 2,
    });
    const { wrapper, shell } = await mountView();
    await wrapper.vm.selectConversation({ id: 'review-conversation', name: 'Review' });
    shell.setSurfaceStatus('dirty');
    const confirm = vi.fn(() => false);
    window.confirm = confirm;
    await wrapper.vm.selectConversation({ id: 'chat-b', name: 'B' });
    expect(fixture.session.chatConversationId.value).toBe('review-conversation');
    expect(confirm).toHaveBeenCalledOnce();
    wrapper.vm.startNewConversation();
    expect(fixture.session.startNewConversation).not.toHaveBeenCalled();
    expect(shell.surfaceStatus).toBe('dirty');
    wrapper.unmount();
  });

  it('keeps automatic navigation for a Goal completed during live execution', async () => {
    localStorage.setItem(
      'ai:conversation-workflow-map:v3',
      JSON.stringify({ 'live-conversation': { activeRunId: 'live-run' } }),
    );
    fixture.getRun.mockResolvedValue({
      runId: 'live-run',
      conversationId: 'live-conversation',
      kind: 'goal.create',
      status: 'running',
      createdAt: 1,
      updatedAt: 2,
    });
    const { wrapper, router } = await mountView();
    await wrapper.vm.selectConversation({ id: 'live-conversation', name: 'Live' });
    await flushPromises();
    await fixture.goal.projectRun({
      runId: 'live-run',
      conversationId: 'live-conversation',
      kind: 'goal.create',
      status: 'completed',
      result: {
        workflowRunId: 'live-run',
        revision: 1,
        status: 'success',
        referenceMap: { goal: 'new-goal' },
        relationIds: {},
        failures: [],
        retryable: false,
      },
      createdAt: 1,
      updatedAt: 3,
    });
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/goals/new-goal');
    wrapper.unmount();
  });

  it('does not deep-link to a completed Goal restored from another conversation', async () => {
    localStorage.setItem(
      'ai:conversation-workflow-map:v3',
      JSON.stringify({ 'history-conversation': { activeRunId: 'history-run' } }),
    );
    fixture.getRun.mockResolvedValue({
      runId: 'history-run',
      conversationId: 'history-conversation',
      kind: 'goal.create',
      status: 'completed',
      result: {
        workflowRunId: 'history-run',
        revision: 1,
        status: 'success',
        referenceMap: { goal: 'historical-goal' },
        relationIds: {},
        failures: [],
        retryable: false,
      },
      createdAt: 1,
      updatedAt: 2,
    });
    const { wrapper, router, shell } = await mountView();
    const before = JSON.stringify(shell.$state);
    await wrapper.vm.selectConversation({ id: 'history-conversation', name: 'History' });
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/goals/current-goal');
    expect(JSON.stringify(shell.$state)).toBe(before);
    wrapper.unmount();
  });
});
