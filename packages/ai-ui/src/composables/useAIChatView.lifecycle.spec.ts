import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ok } from '@memoflow/transport-contracts/result';
import { createNativeAgentFlowFixture } from '@memoflow/ai/testing';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIWorkflowRunView, AssistantRuntimeChoice } from '@memoflow/ai-contracts';
import AIChatView from '../views/AIChatView.vue';
import enAI from '@ai-ui-test-host/locales/en-US/aiAssistant';
import enErrors from '@ai-ui-test-host/locales/en-US/errors';
import { SERVER_STATE_IDENTITY_SCOPE_KEY } from '@ai-ui-test-host/platform/server-state';
import type { UseAIChatSessionOptions } from './useAIChatSession';
import { useAppShellStore } from '@ai-ui-test-host/layouts/shell/useAppShellStore';
import {
  SHELL_COMPOSER_MOUNT_KEY,
  AI_CONFIGURATION_REVISION_KEY,
  AI_AGENT_REGISTRY_KEY,
  AI_LOCAL_AGENT_KEY,
  AI_ASSISTANT_RUNTIME_KEY,
  AI_RUNTIME_USAGE_KEY,
  AI_WORKFLOW_RUNTIME_KEY,
  ASSISTANT_SURFACE_KEY,
} from '@ai-ui-test-host/di/keys';

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
    // Match the real session contract even when a pending component event outlives teardown.
    // The native integration tests still require real turn/start receipts.
    handleSendChat: vi.fn(async () => {}),
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
    realSession: false,
    service: {} as import('./types').AIChatService,
    nativeRunSettled: vi.fn<(connectionId: string) => void>(),
    getRun: vi.fn(),
    providers: ref<import('@memoflow/ai-contracts').AIProviderConfigClientDTO[]>([]),
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
      service: fixture.service,
      providers: fixture.providers,
      isLoadingProviders: ref(false),
      loadProviders: fixture.loadProviders,
      refreshProviderModels: vi.fn(async (providerId: string) => ({
        providerId,
        models: fixture.providers.value
          .filter((provider) => String(provider.id) === providerId && provider.defaultModel)
          .map((provider) => ({
            id: provider.defaultModel,
            name: provider.defaultModel,
          })),
        fetchedAt: Date.now(),
      })),
    }),
  };
});
vi.mock('@memoflow/goal-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/goal-ui')>();
  const { ref } = await import('vue');
  return {
    ...actual,
    useGoal: () => ({ goals: ref([]), fetchGoals: vi.fn() }),
  };
});
vi.mock('@memoflow/task-ui/composables/useTask', async () => {
  const { ref } = await import('vue');
  return { useTask: () => ({ templates: ref([]), fetchTemplates: vi.fn() }) };
});
vi.mock('@memoflow/repository-ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { ref } = await import('vue');
  return {
    ...actual,
    useRecentKnowledgeNotes: () => ({ notes: ref([]), load: vi.fn() }),
    useReferenceableKnowledgeNotes: () => ({ notes: ref([]), load: vi.fn(), cancel: vi.fn() }),
  };
});
vi.mock('@ai-ui-test-host/shared/utils/useStrictInject', async (original) => {
  const actual = await original<typeof import('@ai-ui-test-host/shared/utils/useStrictInject')>();
  return {
    useStrictInject: (...args: Parameters<typeof actual.useStrictInject>) =>
      fixture.realSession ? actual.useStrictInject(...args) : { get: fixture.getRun },
  };
});
vi.mock('./useAIChatSession', async (original) => {
  const actual = await original<typeof import('./useAIChatSession')>();
  return {
    useAIChatSession: (options: UseAIChatSessionOptions) => {
      if (fixture.realSession) return actual.useAIChatSession(options);
      fixture.nativeRunSettled.mockImplementation(options.onNativeRunSettled ?? (() => {}));
      return fixture.session;
    },
  };
});
vi.mock('./useAIGoalWorkflow', () => ({
  useAIGoalWorkflow: () => fixture.goal,
}));
vi.mock('./useAITaskWorkflow', () => ({
  useAITaskWorkflow: () => fixture.task,
}));
vi.mock('./useAIKnowledgeCapture', () => ({
  useAIKnowledgeCapture: () => fixture.knowledge,
}));
vi.mock('./useAIKnowledgeQaWorkflow', () => ({
  useAIKnowledgeQaWorkflow: () => ({ resetKnowledgeAnswer: vi.fn() }),
}));
vi.mock('./chatViewHelpers', async (original) => {
  const actual = await original<typeof import('./chatViewHelpers')>();
  return {
    ...actual,
    initializeChatView: vi.fn((...args: Parameters<typeof actual.initializeChatView>) =>
      fixture.realSession ? actual.initializeChatView(...args) : undefined,
    ),
  };
});

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
          messages: { en: { aiAssistant: enAI, errors: enErrors } },
          missingWarn: false,
          fallbackWarn: false,
        }),
      ],
      provide: {
        [SHELL_COMPOSER_MOUNT_KEY as symbol]: { value: null },
        ...extraProvide,
      },
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
    fixture.realSession = false;
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
          resolve({
            conversationId: 'conv-stop',
            content: '帮我规划今年考研，目标北京大学',
          });
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
    const { wrapper } = await mountView({
      [AI_AGENT_REGISTRY_KEY as symbol]: registry,
    });
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

  it('refreshes the observed native limit once and renders it without changing draft, route or catalog', async () => {
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
    const choice = {
      runtimeKind: 'local_agent' as const,
      connectionId: native.id,
      modelId: 'native-model',
    };
    const ready = {
      status: 'ready' as const,
      models: [{ id: 'native-model', name: 'Real native model' }],
      modelVisibilityContext: `mvc1:${'a'.repeat(64)}`,
    };
    const local = {
      listConnections: vi.fn(async () => [native]),
      getDefaultChoice: vi.fn(async () => choice),
      probeConnection: vi.fn(async () => ready),
    };
    const { wrapper } = await mountView({
      [AI_LOCAL_AGENT_KEY as symbol]: local,
    });
    await flushPromises();
    fixture.session.chatMessage.value = 'Keep the next draft';
    const probesBefore = local.probeConnection.mock.calls.length;
    local.probeConnection.mockResolvedValueOnce({
      ...ready,
      lastExecutionFailure: {
        code: 'LOCAL_AGENT_QUOTA_EXHAUSTED',
        modelId: 'native-model',
        occurredAt: 123,
      },
    } as typeof ready);
    fixture.nativeRunSettled(native.id);
    await flushPromises();
    expect(local.probeConnection).toHaveBeenCalledTimes(probesBefore + 1);
    expect(wrapper.get('[data-testid="ai-native-execution-status"]').text()).toContain(
      'insufficient quota',
    );
    expect(fixture.session.chatMessage.value).toBe('Keep the next draft');
    expect(fixture.session.runtimeChoice.value).toEqual(choice);
    expect(wrapper.vm.canSendMessage).toBe(true);
    fixture.nativeRunSettled(native.id);
    await flushPromises();
    expect(wrapper.find('[data-testid="ai-native-execution-status"]').exists()).toBe(false);
    expect(local.probeConnection).toHaveBeenCalledTimes(probesBefore + 2);
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
    const { wrapper } = await mountView({
      [AI_LOCAL_AGENT_KEY as symbol]: local,
    });
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

  it('shows Provider-verified AGY Gemini models in Workspace without starting a second ACP scan', async () => {
    const connection = {
      id: 'native-antigravity',
      driver: 'antigravity' as const,
      name: 'Antigravity (AGY)',
      executablePath: 'agy_acp_server',
      enabled: true,
      revision: 2,
      createdAt: 1,
      updatedAt: 2,
      writeScopes: [],
    };
    const instance = {
      instanceId: 'antigravity',
      driver: 'antigravity' as const,
      name: 'Antigravity (AGY)',
      enabled: true,
      revision: 2,
      createdAt: 1,
      updatedAt: 2,
      legacyConnectionId: connection.id,
    };
    const registry = {
      list: vi.fn(async () => ({ instances: [instance], bindings: [] })),
    };
    const local = {
      listConnections: vi.fn(async () => [connection]),
      getDefaultChoice: vi.fn(async () => ({
        runtimeKind: 'builtin' as const,
      })),
      cachedCatalogConnection: vi.fn(async () => ({
        status: 'ready' as const,
        models: [{ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' }],
        modelVisibilityContext: 'mvc1:' + 'f'.repeat(64),
      })),
      // This deliberately fails if Workspace opens a second ACP process.
      probeConnection: vi.fn(async () => {
        throw new Error('Unexpected redundant ACP scan');
      }),
      probeDefaultDriver: vi.fn(async () => {
        throw new Error('Unexpected implicit ACP scan');
      }),
    };
    const { wrapper } = await mountView({
      [AI_AGENT_REGISTRY_KEY as symbol]: registry,
      [AI_LOCAL_AGENT_KEY as symbol]: local,
    });
    await vi.waitFor(() =>
      expect(wrapper.vm.composerModels).toEqual([
        expect.objectContaining({
          agentKey: 'local:native-antigravity',
          agentInstanceId: 'antigravity',
          modelId: 'gemini-3.8-flash',
          modelName: 'Gemini 3.8 Flash',
        }),
      ]),
    );
    expect(local.cachedCatalogConnection).toHaveBeenCalledWith(connection.id);
    expect(local.probeConnection).not.toHaveBeenCalled();
    expect(local.probeDefaultDriver).not.toHaveBeenCalled();

    // User chooses a model displayed in Workspace. Rechecking the native
    // membership must be instant: the host independently validated the
    // identity and revision of this catalog observation.
    fixture.session.chatMessage.value = 'Keep this draft while selecting Gemini';
    await wrapper.vm.selectComposerModel('gemini-3.8-flash', 'local:native-antigravity');
    await flushPromises();
    expect(local.probeConnection).not.toHaveBeenCalled();
    expect(fixture.session.runtimeChoice.value).toEqual({
      runtimeKind: 'local_agent',
      connectionId: connection.id,
      modelId: 'gemini-3.8-flash',
    });
    expect(fixture.session.chatMessage.value).toBe('Keep this draft while selecting Gemini');
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
    const materialized = {
      ...implicit,
      legacyConnectionId: connection.id,
      revision: 1,
    };
    let saved = false;
    const registry = {
      list: vi.fn(async () => ({
        instances: [saved ? materialized : implicit],
        bindings: [],
      })),
      execute: vi.fn(async () => {
        saved = true;
        return materialized;
      }),
    };
    const local = {
      listConnections: vi.fn(async () => (saved ? [connection] : [])),
      getDefaultChoice: vi.fn(async () => ({
        runtimeKind: 'builtin' as const,
      })),
      probeConnection: vi.fn(async () => ({
        status: 'ready',
        models: [{ id: 'real-codex-model', name: 'From Codex model/list' }],
      })),
      probeDefaultDriver: vi.fn(async () => ({
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

    expect(wrapper.vm.composerModels).toEqual([
      expect.objectContaining({
        modelId: 'real-codex-model',
        agentKey: 'local:codex',
      }),
    ]);
    fixture.session.chatMessage.value = 'Preserve the draft';
    registry.execute.mockRejectedValueOnce(new Error('Recoverable materialization failure'));
    await wrapper.vm.selectComposerModel('real-codex-model', 'local:codex');
    expect(fixture.session.runtimeChoice.value).toEqual({
      runtimeKind: 'builtin',
    });
    expect(fixture.session.chatMessage.value).toBe('Preserve the draft');
    expect(await local.listConnections()).toEqual([]);
    local.probeConnection.mockRejectedValueOnce(
      new Error('Native discovery failed during selection'),
    );
    await wrapper.vm.selectComposerModel('real-codex-model', 'local:codex');
    expect(fixture.session.runtimeChoice.value).toEqual({
      runtimeKind: 'builtin',
    });
    expect(fixture.session.chatMessage.value).toBe('Preserve the draft');
    expect(await local.listConnections()).toEqual([connection]);
    // Explicit materialization is reusable after a recoverable discovery failure.
    await wrapper.vm.refreshComposerCatalog();
    await wrapper.vm.selectComposerModel('real-codex-model', 'local:' + connection.id);
    await flushPromises();
    expect(registry.execute).toHaveBeenCalledTimes(2);
    expect(registry.execute).toHaveBeenCalledWith({
      action: 'update',
      instanceId: 'codex',
      expectedRevision: 0,
      patch: {},
    });
    expect(fixture.session.runtimeChoice.value).toEqual({
      runtimeKind: 'local_agent',
      connectionId: connection.id,
      modelId: 'real-codex-model',
    });
    expect(fixture.session.chatMessage.value).toBe('Preserve the draft');
    expect(wrapper.vm.composerModels).toEqual([
      expect.objectContaining({
        modelId: 'real-codex-model',
        agentKey: 'local:' + connection.id,
      }),
    ]);
    await wrapper.vm.selectComposerModel('real-codex-model', 'local:' + connection.id);
    expect(fixture.session.runtimeChoice.value).toMatchObject({
      connectionId: connection.id,
      modelId: 'real-codex-model',
    });
    await vi.waitFor(() => expect(wrapper.vm.canSendMessage).toBe(true));
    expect(registry.execute).toHaveBeenCalledTimes(2);
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
      bindings: [] as Array<{
        instanceId: string;
        connectionId: string;
        modelId: string;
      }>,
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
    state = {
      instances: [{ ...instance, enabled: false }],
      bindings: state.bindings,
    };
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
      } as import('@memoflow/ai-contracts').AIProviderConfigClientDTO,
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
    const { wrapper } = await mountView({
      [AI_AGENT_REGISTRY_KEY as symbol]: registry,
    });
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
        JSON.stringify({
          'history-conversation': { activeRunId: 'history-run' },
        }),
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
      await wrapper.vm.selectConversation({
        id: 'history-conversation',
        name: 'History',
      });
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
    await wrapper.vm.selectConversation({
      id: 'review-conversation',
      name: 'Review',
    });
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
    await wrapper.vm.selectConversation({
      id: 'live-conversation',
      name: 'Live',
    });
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
      JSON.stringify({
        'history-conversation': { activeRunId: 'history-run' },
      }),
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
    await wrapper.vm.selectConversation({
      id: 'history-conversation',
      name: 'History',
    });
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/goals/current-goal');
    expect(JSON.stringify(shell.$state)).toBe(before);
    wrapper.unmount();
  });
});

/** Real renderer clients/DTOs + Registry/SQLite/Runtime/Driver. Only Electron IPC
 * delivery and the external Codex process are fixtures; no native executable or
 * private Home is used. The unrelated business workflow projections above stay stubbed.
 */
async function nativeFlow() {
  const directory = await mkdtemp(join(tmpdir(), 'memoflow-native-flow-'));
  vi.stubEnv('CODEX_HOME', directory);
  const flow = createNativeAgentFlowFixture(directory);
  fixture.goal.goalWorkflowRun.value = null;
  fixture.task.taskWorkflowRun.value = null;
  fixture.knowledge.knowledgeCaptureRun.value = null;
  fixture.realSession = true;
  fixture.service = {
    listConversations: vi.fn(async () => ok({ data: [], total: 0, page: 1, pageSize: 24 })),
    createConversation: vi.fn(() => {
      throw new Error('Native chat must not use builtin creation');
    }),
    updateConversation: vi.fn(async () => ok(null)),
  } as unknown as import('./types').AIChatService;
  return {
    ...flow,
    provide: {
      [AI_AGENT_REGISTRY_KEY as symbol]: flow.registryClient,
      [AI_LOCAL_AGENT_KEY as symbol]: flow.local,
      [AI_ASSISTANT_RUNTIME_KEY as symbol]: flow.assistant,
      [AI_RUNTIME_USAGE_KEY as symbol]: { get: vi.fn() },
      [AI_WORKFLOW_RUNTIME_KEY as symbol]: {
        get: vi.fn(),
        streamWorkspaceEvents: vi.fn(async () => {}),
      },
      [ASSISTANT_SURFACE_KEY as symbol]: 'desktop',
      [SERVER_STATE_IDENTITY_SCOPE_KEY as symbol]: flow.identity,
    },
    async close() {
      await flow.close();
      vi.unstubAllEnvs();
      fixture.realSession = false;
      await rm(directory, { recursive: true, force: true });
    },
  };
}

// A full app-vue run on a shared 4-core host starves these polls well past the 1s default.
const waitFor = <T>(callback: () => T | Promise<T>) =>
  vi.waitFor(callback, { timeout: 10_000, interval: 100 });

it.each(['implicit default', 'saved instance'])(
  'integrates Registry → Probe → Select → Connection → Compose → Send for %s with Profile and quota isolation',
  async (kind) => {
    localStorage.clear();
    const flow = await nativeFlow();
    let wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'] | undefined;
    try {
      if (kind === 'saved instance') {
        await flow.registry.execute('profile-a', {
          action: 'update',
          instanceId: 'codex',
          expectedRevision: 0,
          patch: {},
        });
      }
      const before = await flow.store.listConnections('profile-a');
      const probe = before.length
        ? await flow.local.probeConnection(before[0].id)
        : await flow.local.probeDefaultDriver('codex');
      expect(probe).toMatchObject({
        status: 'ready',
        models: [{ id: 'fixture-model' }],
      });
      expect(
        (await flow.registry.list('profile-a')).instances.find((i) => i.instanceId === 'codex')
          ?.enabled,
      ).toBe(true);
      expect(await flow.store.listConnections('profile-a')).toEqual(before);
      expect(flow.requests.some(([method]) => method === 'turn/start')).toBe(false);

      if (kind === 'saved instance') {
        await flow.local.setDefaultChoice({
          runtimeKind: 'local_agent',
          connectionId: before[0].id,
          modelId: 'fixture-model',
        });
      }
      const configured = await flow.store.listConnections('profile-a');
      ({ wrapper } = await mountView(flow.provide));
      await flushPromises();
      if (kind === 'saved instance') {
        await waitFor(() => expect(wrapper!.vm.canSendMessage).toBe(true));
        expect(wrapper.vm.runtimeChoice).toMatchObject({
          connectionId: before[0].id,
          modelId: 'fixture-model',
        });
      }
      expect(await flow.store.listConnections('profile-a')).toEqual(configured);
      const instance = (await flow.registry.list('profile-a')).instances.find(
        (i) => i.instanceId === 'codex',
      )!;
      await waitFor(() =>
        expect(
          wrapper!.vm.composerModels.filter(
            (model: { agentInstanceId?: string }) => model.agentInstanceId === 'codex',
          ),
        ).toHaveLength(1),
      );
      expect(flow.requests.filter(([method]) => method === 'turn/start')).toHaveLength(0);
      await wrapper.vm.selectComposerModel(
        'fixture-model',
        `local:${instance.legacyConnectionId ?? 'codex'}`,
      );
      const [connection] = await flow.store.listConnections('profile-a');
      expect(await flow.store.listConnections('profile-a')).toHaveLength(1);
      expect(connection.instanceSlug).toBe('codex');
      await wrapper.vm.selectComposerModel('fixture-model', `local:${connection.id}`);
      await flushPromises();
      expect(wrapper.vm.runtimeChoice).toEqual({
        runtimeKind: 'local_agent',
        connectionId: connection.id,
        modelId: 'fixture-model',
      });
      const composer = wrapper.findComponent({ name: 'AIFooterComposer' });
      expect(composer.props('canSend')).toBe(true);
      expect(flow.requests.filter(([method]) => method === 'turn/start')).toHaveLength(0);
      composer.vm.$emit('update:modelValue', 'Hello from profile A');
      composer.vm.$emit('send');
      await waitFor(() => expect(wrapper!.vm.chatTimeline.at(-1)?.status).toBe('success'));
      await waitFor(() => expect(wrapper!.vm.chatLoading).toBe(false));
      await flushPromises();
      expect(wrapper.vm.chatTimeline.at(-1)?.content).toBe('Fixture answer');
      expect(wrapper.vm.chatTimeline.at(-1)?.status).toBe('success');
      const conversationId = wrapper.vm.chatConversationId;
      expect(await flow.store.getConversation('profile-a', conversationId)).toMatchObject({
        connectionId: connection.id,
        modelId: 'fixture-model',
      });
      const turns = flow.requests.filter(([method]) => method === 'turn/start');
      expect(turns).toHaveLength(1);
      expect(turns[0][1]).toMatchObject({
        model: 'fixture-model',
        input: [
          {
            type: 'text',
            text: expect.stringContaining('Hello from profile A'),
          },
        ],
      });
      expect(fixture.service.createConversation).not.toHaveBeenCalled();

      await waitFor(() => expect(wrapper!.vm.canSendMessage).toBe(true));
      flow.setFailure();
      wrapper
        .findComponent({ name: 'AIFooterComposer' })
        .vm.$emit('update:modelValue', 'Preserve this limited request');
      expect(wrapper.vm.chatMessage).toBe('Preserve this limited request');
      wrapper.findComponent({ name: 'AIFooterComposer' }).vm.$emit('send');
      await waitFor(() =>
        expect(wrapper!.vm.chatTimeline.at(-1)?.errorMessage).toBe(
          enErrors.LOCAL_AGENT_QUOTA_EXHAUSTED,
        ),
      );
      await waitFor(() => expect(wrapper!.vm.chatLoading).toBe(false));
      await flushPromises();
      expect(flow.requests.filter(([method]) => method === 'turn/start')).toHaveLength(2);
      expect(wrapper.vm.chatTimeline.at(-1)?.errorMessage).toBe(
        enErrors.LOCAL_AGENT_QUOTA_EXHAUSTED,
      );
      expect(wrapper.vm.chatMessage).toBe('Preserve this limited request');
      await waitFor(() =>
        expect(wrapper!.find('[data-testid="ai-native-execution-status"]').exists()).toBe(true),
      );
      expect(wrapper.get('[data-testid="ai-native-execution-status"]').text()).toContain(
        'insufficient quota',
      );
      expect(wrapper.vm.runtimeChoice).toMatchObject({
        connectionId: connection.id,
        modelId: 'fixture-model',
      });
      expect(flow.requests.filter(([method]) => method === 'turn/start')).toHaveLength(2);

      wrapper.unmount();
      await flow.switchProfile();
      ({ wrapper } = await mountView(flow.provide));
      await flushPromises();
      expect(wrapper.vm.runtimeChoice).toEqual({ runtimeKind: 'builtin' });
      expect(wrapper.find('[data-testid="ai-native-execution-status"]').exists()).toBe(false);
      expect(await flow.store.listConnections('profile-b')).toEqual([]);
      expect(await flow.local.listConversations()).toEqual([]);
      await expect(flow.store.getConversation('profile-b', conversationId)).rejects.toThrow();
      await waitFor(() =>
        expect(
          wrapper!.vm.composerModels.filter(
            (model: { agentInstanceId?: string }) => model.agentInstanceId === 'codex',
          ),
        ).toHaveLength(1),
      );
      await wrapper.vm.selectComposerModel('fixture-model', 'local:codex');
      const [otherConnection] = await flow.store.listConnections('profile-b');
      expect(otherConnection.id).not.toBe(connection.id);
      await expect(flow.store.getConnection('profile-b', connection.id)).rejects.toThrow();
      const otherProbe = await flow.local.probeConnection(otherConnection.id);
      expect(otherProbe).toMatchObject({
        status: 'ready',
        account: { email: 'profile-b@example.test' },
      });
      expect(otherProbe).not.toHaveProperty('lastExecutionFailure');
      await wrapper.vm.selectComposerModel('fixture-model', `local:${otherConnection.id}`);
      await flushPromises();
      const otherComposer = wrapper.findComponent({ name: 'AIFooterComposer' });
      expect(otherComposer.props('canSend')).toBe(true);
      otherComposer.vm.$emit('update:modelValue', 'Hello from profile B');
      otherComposer.vm.$emit('send');
      await waitFor(() => expect(wrapper!.vm.chatTimeline.at(-1)?.status).toBe('success'));
      await waitFor(() => expect(wrapper!.vm.chatLoading).toBe(false));
      await flushPromises();
      expect(wrapper.vm.chatTimeline.at(-1)?.content).toBe('Fixture answer');
      expect(wrapper.vm.runtimeChoice).toMatchObject({
        connectionId: otherConnection.id,
        modelId: 'fixture-model',
      });
      expect(wrapper.vm.chatConversationId).not.toBe(conversationId);
      expect(wrapper.find('[data-testid="ai-native-execution-status"]').exists()).toBe(false);
      expect((await flow.local.listConversations()).map((item) => item.id)).toEqual([
        wrapper.vm.chatConversationId,
      ]);
      expect(flow.requests.filter(([method]) => method === 'turn/start')).toHaveLength(3);

      expect(
        (await flow.store.listMessages('profile-a', conversationId)).messages
          .filter((m) => m.role === 'user')
          .map((m) => m.content),
      ).toEqual(['Hello from profile A', 'Preserve this limited request']);
      expect(fixture.service.createConversation).not.toHaveBeenCalled();
    } finally {
      wrapper?.unmount();
      await flow.close();
    }
  },
  // The full Registry → Probe → Select → Connection → Compose → Send flow runs two profiles
  // with real storage and many vi.waitFor polls; on a loaded host it exceeds the 5s default.
  30_000,
);
