import { flushPromises, shallowMount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIWorkflowRunView, AssistantRuntimeChoice } from '@memoflow/contracts/ai';
import AIChatView from '../views/AIChatView.vue';
import { useAppShellStore } from '../../../layouts/shell/useAppShellStore';
import {
  SHELL_COMPOSER_MOUNT_KEY,
  AI_CONFIGURATION_REVISION_KEY,
  AI_AGENT_REGISTRY_KEY,
  AI_LOCAL_AGENT_KEY,
} from '../../../di/keys';

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
    prepareWorkflowTurn: vi.fn(),
    stopGenerating: vi.fn(),
    scrollMessagesToBottom: vi.fn(),
    selectConversation: vi.fn(async (item: { id: string }) => {
      session.chatConversationId.value = item.id;
    }),
    startNewConversation: vi.fn(() => {
      session.chatConversationId.value = null;
    }),
    resetChatSession: vi.fn((mode: string, getDefaultName: (mode: string) => string) => {
      session.chatMessage.value = '';
      session.chatConversationId.value = null;
      session.conversationTitle.value = getDefaultName(mode);
    }),
    loadConversationList: vi.fn(),
  };
  return {
    getRun: vi.fn(),
    providers: ref<import('@memoflow/contracts/ai').AIProviderConfigClientDTO[]>([]),
    loadProviders: vi.fn(async () => undefined),
    session,
    openGoal,
    openTask,
    openKnowledge,
    goal: {
      goalWorkflowRun: goalRun,
      goalWorkflowStage: ref('collect'),
      goalAgentResuming: ref(false),
      goalAgentLoading: ref(false),
      goalAgentWaitingForClarification: ref(false),
      goalAgentWaitingForApproval: ref(false),
      goalSurfaceConflict: ref(false),
      goalRestartPending: ref(false),
      goalSurfaceControlLost: ref(false),
      goalSurfaceReady: ref(false),
      goalManualHandoff: ref(false),
      continueGoalSurfaceControl: vi.fn(),
      handoffGoalNativeReview: vi.fn(),
      cancelGoalAgentRun: vi.fn(),
      confirmGoalAgentRun: vi.fn(),
      startGoalAgentRun: vi.fn(),
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
      taskAgentWaitingForClarification: ref(false),
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
      knowledgeCaptureWaitingForClarification: ref(false),
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
  return {
    useAI: () => ({
      service: {},
      providers: fixture.providers,
      isLoadingProviders: ref(false),
      loadProviders: fixture.loadProviders,
      refreshProviderModels: vi.fn(async (providerId: string) => ({
        providerId,
        models: fixture.providers.value
          .filter((provider) => String(provider.id) === providerId && provider.defaultModel)
          .map((provider) => ({ id: provider.defaultModel, name: provider.defaultModel })),
        fetchedAt: Date.now(),
      })),
    }),
  };
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

async function mountView(extraProvide: Record<symbol, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/goals/:id', component: { template: '<div />' } }],
  });
  await router.push('/goals/current-goal');
  const pinia = createPinia();
  const wrapper = shallowMount(AIChatView, {
    props: { composerOnly: true },
    global: {
      stubs: { teleport: true },
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
      provide: { [SHELL_COMPOSER_MOUNT_KEY as symbol]: { value: null }, ...extraProvide },
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
    fixture.session.chatMessage.value = '';
    fixture.session.runtimeChoice.value = { runtimeKind: 'builtin' };
  });

  it('does not start a Goal workflow after Stop during conversation preparation', async () => {
    let prepared!: () => void;
    fixture.session.prepareWorkflowTurn.mockReturnValue(
      new Promise((resolve) => {
        prepared = () =>
          resolve({ conversationId: 'conv-stop', content: '帮我规划今年考研，目标北京大学' });
      }),
    );
    const { wrapper } = await mountView();
    await flushPromises();
    fixture.session.chatMessage.value = '帮我规划今年考研，目标北京大学';
    const composer = wrapper.findComponent({ name: 'AIFooterComposer' });
    composer.vm.$emit('send');
    await flushPromises();
    expect(fixture.session.prepareWorkflowTurn).toHaveBeenCalledOnce();
    wrapper.findComponent({ name: 'AIFooterComposer' }).vm.$emit('stop');
    prepared();
    await flushPromises();
    expect(
      fixture.goal.cancelGoalAgentRun.mock.calls.length +
        fixture.session.stopGenerating.mock.calls.length,
    ).toBe(1);
    expect(fixture.goal.startGoalAgentRun).not.toHaveBeenCalled();
  });

  it('resets once before awaiting the Agent Registry and preserves drafts typed during initialization', async () => {
    let releaseRegistry = () => {};
    const waitingForRegistry = new Promise<void>((resolve) => {
      releaseRegistry = resolve;
    });
    const registry = {
      list: vi.fn(() => waitingForRegistry.then(() => ({ instances: [], bindings: [] }))),
    };
    const { wrapper } = await mountView({ [AI_AGENT_REGISTRY_KEY as symbol]: registry });
    await flushPromises();
    expect(registry.list).toHaveBeenCalledOnce();
    expect(fixture.session.resetChatSession).toHaveBeenCalledOnce();
    fixture.session.chatMessage.value = 'My draft during an unfinished registry request';

    releaseRegistry();
    await flushPromises();
    expect(fixture.session.resetChatSession).toHaveBeenCalledOnce();
    expect(fixture.session.chatMessage.value).toBe(
      'My draft during an unfinished registry request',
    );
    wrapper.unmount();
  });

  it('applies a discovered saved native default without clearing a Composer draft or resetting twice', async () => {
    const native = {
      id: 'native-codex-01',
      driver: 'codex',
      name: 'Codex',
      executablePath: 'codex',
      enabled: true,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      writeScopes: [],
    };
    let resolveDefault!: (choice: AssistantRuntimeChoice) => void;
    const local = {
      listConnections: vi.fn(async () => [native]),
      getDefaultChoice: vi.fn(
        () => new Promise<AssistantRuntimeChoice>((resolve) => (resolveDefault = resolve)),
      ),
      probeConnection: vi.fn(async () => ({
        status: 'ready',
        models: [{ id: 'native-model', name: 'Real native model' }],
      })),
    };
    const { wrapper } = await mountView({ [AI_LOCAL_AGENT_KEY as symbol]: local });
    fixture.session.chatMessage.value = 'Keep my unsent draft';
    expect(fixture.session.resetChatSession).toHaveBeenCalledOnce();

    resolveDefault({
      runtimeKind: 'local_agent',
      connectionId: native.id,
      modelId: 'native-model',
    });
    await flushPromises();
    expect(fixture.session.runtimeChoice.value).toEqual({
      runtimeKind: 'local_agent',
      connectionId: native.id,
      modelId: 'native-model',
    });
    expect(fixture.session.chatMessage.value).toBe('Keep my unsent draft');
    expect(fixture.session.resetChatSession).toHaveBeenCalledOnce();
    expect(local.probeConnection).toHaveBeenCalledWith(native.id);
    expect(wrapper.vm.canSendMessage).toBe(true);
  });

  it('materializes a default Codex only on explicit selection and maps its real model to a sendable Connection', async () => {
    const implicit = {
      instanceId: 'codex',
      driver: 'codex' as const,
      name: 'Codex',
      accentColor: '#6469da',
      enabled: true,
      revision: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    const connection = {
      id: 'native-codex-uuid',
      driver: 'codex' as const,
      name: 'Codex',
      executablePath: 'codex',
      enabled: true,
      revision: 1,
      createdAt: 10,
      updatedAt: 10,
      writeScopes: [],
    };
    const materialized = { ...implicit, legacyConnectionId: connection.id, revision: 1 };
    let saved = false;
    const registry = {
      list: vi.fn(async () => ({ instances: [saved ? materialized : implicit], bindings: [] })),
      execute: vi.fn(async () => {
        saved = true;
        return materialized;
      }),
    };
    const local = {
      listConnections: vi.fn(async () => (saved ? [connection] : [])),
      getDefaultChoice: vi.fn(async () => ({ runtimeKind: 'builtin' as const })),
      probeConnection: vi.fn(async () => ({
        status: 'ready',
        models: [{ id: 'real-codex-model', name: 'From Codex model/list' }],
      })),
    };
    const { wrapper } = await mountView({
      [AI_AGENT_REGISTRY_KEY as symbol]: registry,
      [AI_LOCAL_AGENT_KEY as symbol]: local,
    });
    await flushPromises();
    expect(registry.execute).not.toHaveBeenCalled();
    expect(wrapper.vm.composerAgents).toEqual([
      expect.objectContaining({ id: 'local:codex', configured: false }),
    ]);

    await wrapper.vm.selectComposerAgent('local:codex');
    await flushPromises();
    expect(registry.execute).toHaveBeenCalledOnce();
    expect(registry.execute).toHaveBeenCalledWith({
      action: 'update',
      instanceId: 'codex',
      expectedRevision: 0,
      patch: {},
    });
    expect(fixture.session.runtimeChoice.value).toEqual({
      runtimeKind: 'local_agent',
      connectionId: connection.id,
      modelId: '',
    });
    expect(wrapper.vm.composerModels).toEqual([
      expect.objectContaining({ modelId: 'real-codex-model', agentKey: 'local:' + connection.id }),
    ]);
    await wrapper.vm.selectComposerModel('real-codex-model', 'local:' + connection.id);
    expect(fixture.session.runtimeChoice.value).toMatchObject({
      connectionId: connection.id,
      modelId: 'real-codex-model',
    });
    expect(wrapper.vm.canSendMessage).toBe(true);
    expect(registry.execute).toHaveBeenCalledOnce();
  });

  it('refreshes the persistent composer after settings invalidates the app configuration', async () => {
    const { ref } = await import('vue');
    const revision = ref(0);
    fixture.providers.value = [];
    const instance = {
      instanceId: 'mastra',
      driver: 'mastra',
      name: 'Work Agent',
      enabled: true,
      accentColor: '#6469da',
      revision: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    let state = {
      instances: [instance],
      bindings: [] as Array<{ instanceId: string; connectionId: string; modelId: string }>,
    };
    const registry = { list: vi.fn(async () => state) };
    const { wrapper } = await mountView({
      [AI_CONFIGURATION_REVISION_KEY as symbol]: revision,
      [AI_AGENT_REGISTRY_KEY as symbol]: registry,
    });
    await flushPromises();
    expect(wrapper.vm.canSendMessage).toBe(false);
    const uid = wrapper.vm.$.uid;
    fixture.providers.value = [
      {
        id: 'p1',
        identityId: 'owner',
        name: 'Service',
        providerDefinitionId: 'custom',
        baseUrl: 'https://example.test/v1',
        credentialRef: 'ref',
        isActive: true,
        isDefault: false,
        priority: 1,
        version: 1,
        defaultModel: 'model',
        createdAt: 0,
        updatedAt: 0,
        deletedAt: null,
      },
    ] as never;
    state = {
      instances: [instance],
      bindings: [{ instanceId: 'mastra', connectionId: 'p1', modelId: 'model' }],
    };
    revision.value++;
    await flushPromises();
    expect(registry.list.mock.calls.length).toBeGreaterThan(1);
    expect(wrapper.vm.canSendMessage).toBe(true);
    expect(wrapper.vm.selectedModelKey).toBe('agent:mastra::p1::model');
    expect(wrapper.vm.$.uid).toBe(uid);
    revision.value++;
    state = { instances: [{ ...instance, enabled: false }], bindings: state.bindings };
    await flushPromises();
    expect(wrapper.vm.canSendMessage).toBe(false);
    fixture.providers.value = [];
  });

  it('switches Mastra instances without clearing the conversation, transcript or draft and blocks busy switches', async () => {
    fixture.providers.value = [
      {
        id: 'p1',
        name: 'Provider',
        defaultModel: 'model',
        isActive: true,
      } as import('@memoflow/contracts/ai').AIProviderConfigClientDTO,
    ];
    const entries = ['mastra', 'work'].map((instanceId) => ({
      instanceId,
      driver: 'mastra',
      name: instanceId,
      enabled: true,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    }));
    const registry = {
      list: vi.fn(async () => ({
        instances: entries,
        bindings: entries.map((entry) => ({
          instanceId: entry.instanceId,
          connectionId: 'p1',
          modelId: 'model',
        })),
      })),
    };
    const { wrapper } = await mountView({ [AI_AGENT_REGISTRY_KEY as symbol]: registry });
    await flushPromises();
    fixture.session.chatConversationId.value = 'same-conversation';
    fixture.session.chatMessage.value = 'Keep draft';
    wrapper.vm.permissionMode = 'read-only';
    await flushPromises();
    await wrapper.vm.selectComposerModel('agent:work::p1::model', 'agent:work');
    expect(fixture.session.startNewConversation).not.toHaveBeenCalled();
    expect(fixture.session.chatConversationId.value).toBe('same-conversation');
    expect(fixture.session.chatMessage.value).toBe('Keep draft');
    expect(wrapper.vm.selectedModelKey).toBe('agent:work::p1::model');
    expect(wrapper.vm.permissionMode).toBe('supervised');
    fixture.session.chatLoading.value = true;
    await wrapper.vm.selectComposerModel('agent:mastra::p1::model', 'agent:mastra');
    expect(wrapper.vm.selectedModelKey).toBe('agent:work::p1::model');
    fixture.session.chatLoading.value = false;
    await wrapper.vm.localAssistant.select({
      runtimeKind: 'local_agent',
      connectionId: 'other',
      modelId: 'native',
    });
    expect(fixture.session.runtimeChoice.value.runtimeKind).toBe('builtin');
    expect(fixture.session.startNewConversation).not.toHaveBeenCalled();
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
    expect(fixture.session.startNewConversation).not.toHaveBeenCalled();
    expect(fixture.session.runtimeChoice.value).toMatchObject({
      connectionId: 'agent-one',
      modelId: 'new',
    });
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
