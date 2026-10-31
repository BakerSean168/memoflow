import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIChannels, type IElectronModuleContext } from '@memoflow/desktop-contracts';
import { ok } from '@memoflow/transport-contracts/result';
import type { AIModuleInstance } from '../server/infrastructure';
import { AIExecutionError } from '../shared/ai-execution-error';
import { EventEmitter } from 'node:events';
import type { GoalWorkflowEventSource } from '../server/application/ports/goal-workflow-events.port';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const handle = vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    if (handlers.has(channel)) throw new Error(`second handler: ${channel}`);
    handlers.set(channel, handler);
  });
  const removeHandler = vi.fn((channel: string) => handlers.delete(channel));
  return { handlers, handle, removeHandler };
});

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle, removeHandler: mocks.removeHandler },
}));
import { createAIElectronModule } from './index';

const CURRENT_CHANNELS = [
  AIChannels.AGENT_INSTANCE,
  AIChannels.LOCAL_AGENT,
  AIChannels.CAPABILITIES_GET,
  AIChannels.PROVIDER_CATALOG_GET,
  AIChannels.PROVIDER_ONBOARDING_PROBE,
  AIChannels.PROVIDER_ONBOARDING_TEST_MODEL,
  AIChannels.PROVIDER_ONBOARDING_COMMIT,
  AIChannels.PROVIDER_REPLACEMENT_PROBE,
  AIChannels.PROVIDER_REPLACEMENT_COMMIT,
  AIChannels.PROVIDER_LIST,
  AIChannels.PROVIDER_GET,
  AIChannels.PROVIDER_UPDATE,
  AIChannels.PROVIDER_DELETE,
  AIChannels.PROVIDER_TEST,
  AIChannels.PROVIDER_SET_DEFAULT,
  AIChannels.PROVIDER_REFRESH_MODELS,
  AIChannels.CONVERSATION_CREATE,
  AIChannels.CONVERSATION_UPDATE,
  AIChannels.CONVERSATION_LIST,
  AIChannels.CONVERSATION_GET,
  AIChannels.CONVERSATION_DELETE,
  AIChannels.RUNTIME_ASSISTANT_START,
  AIChannels.RUNTIME_ASSISTANT_CANCEL,
  AIChannels.RUNTIME_ASSISTANT_APPROVAL,
  AIChannels.RUNTIME_ASSISTANT_ANSWER,
  AIChannels.RUNTIME_ASSISTANT_ASK_USER_PENDING,
  AIChannels.RUNTIME_ASSISTANT_HISTORY,
  AIChannels.RUNTIME_ASSISTANT_DELETE,
  AIChannels.RUNTIME_ASSISTANT_ATTENTION_LIST,
  AIChannels.RUNTIME_ASSISTANT_ATTENTION_ACK,
  AIChannels.RUNTIME_USAGE_GET,
  AIChannels.RUNTIME_WORKFLOW_START,
  AIChannels.RUNTIME_WORKSPACE_START,
  AIChannels.RUNTIME_WORKSPACE_ACK,
  AIChannels.RUNTIME_WORKSPACE_STOP,
  AIChannels.RUNTIME_WORKFLOW_RESUME,
  AIChannels.RUNTIME_WORKFLOW_GET,
  AIChannels.RUNTIME_WORKFLOW_LIST,
  AIChannels.RUNTIME_WORKFLOW_CANCEL,
  AIChannels.RUNTIME_WORKFLOW_GOAL_SURFACE_LEASE,
  AIChannels.KNOWLEDGE_QUERY,
  AIChannels.KNOWLEDGE_EXPAND,
  AIChannels.KNOWLEDGE_REINDEX,
  AIChannels.ANALYTICS_QUERY,
  AIChannels.EVALUATION_OVERVIEW_GET,
] as const;

function createFakeInstance() {
  const providerManagement = {
    getCapabilities: vi.fn(async () => ok(null as never)),
    getProviderCatalog: vi.fn(async () => ok([] as never)),
    probeProviderConnection: vi.fn(async () => ok(null as never)),
    testProviderOnboardingModel: vi.fn(async () => ok(null as never)),
    commitProviderOnboarding: vi.fn(async () => ok(null as never)),
    probeProviderReplacement: vi.fn(async () => ok(null as never)),
    commitProviderReplacement: vi.fn(async () => ok(null as never)),
    listProviders: vi.fn(async () => ok([] as never)),
    getProvider: vi.fn(async () => ok(null as never)),
    updateProvider: vi.fn(async () => ok(null as never)),
    deleteProvider: vi.fn(async () => ok(null as never)),
    testConnection: vi.fn(async () => ok(null as never)),
    setDefaultProvider: vi.fn(async () => ok(null as never)),
    refreshProviderModels: vi.fn(async () => ok(null as never)),
  };
  const assistantConversation = {
    createConversation: vi.fn(async () => ok(null as never)),
    updateConversation: vi.fn(async () => ok(null as never)),
    listConversations: vi.fn(async () => ok({ data: [], total: 0 } as never)),
    getConversation: vi.fn(async () => ok(null as never)),
    deleteConversation: vi.fn(async () => ok(null as never)),
  };
  const knowledge = {
    queryKnowledge: vi.fn(async () => ok(null as never)),
    expandKnowledge: vi.fn(async () => ok(null as never)),
    reindexKnowledge: vi.fn(async () => ok(null as never)),
  };
  const evaluationOperations = {
    queryAnalytics: vi.fn(async () => ok(null as never)),
    getEvaluationOverview: vi.fn(async () => ok(null as never)),
  };
  const summarizeUsage = vi.fn(async () => ({
    executionCount: 1,
    promptTokens: 100,
    completionTokens: 25,
    totalTokens: 125,
    estimatedCost: 0.0000375,
  }));
  const decideToolApproval = vi.fn(async () => false);
  const answerToolSuspension = vi.fn(async () => true);
  const attentionPort = {
    list: vi.fn(async () => []),
    acknowledge: vi.fn(async () => true),
    transition: vi.fn(async () => undefined),
    heartbeat: vi.fn(async () => undefined),
    forget: vi.fn(async () => undefined),
  };
  const start = vi.fn(async () => {});
  const dispose = vi.fn(async () => {});
  const instance = {
    conversationRepository: {} as never,
    providerConfigRepository: {} as never,
    services: {} as never,
    providerManagement,
    assistantConversation,
    knowledge,
    evaluationOperations,
    mastraRuntime: { summarizeUsage, decideToolApproval, answerToolSuspension } as never,
    conversationAttentionPort: attentionPort,
    workflowRuntime: null,
    start,
    dispose,
  } as AIModuleInstance;
  return {
    instance,
    providerManagement,
    assistantConversation,
    knowledge,
    evaluationOperations,
    summarizeUsage,
    decideToolApproval,
    answerToolSuspension,
    attentionPort,
    start,
    dispose,
  };
}

function createFakeContext(): IElectronModuleContext {
  return {
    auth: { requireRequestContext: vi.fn().mockResolvedValue({ identityId: 'identity-1' }) },
  } as unknown as IElectronModuleContext;
}

describe('createAIElectronModule lifecycle', () => {
  let fake: ReturnType<typeof createFakeInstance>;
  let moduleDef: ReturnType<typeof createAIElectronModule>;

  beforeEach(() => {
    fake = createFakeInstance();
    moduleDef = createAIElectronModule({ instance: fake.instance });
  });

  afterEach(async () => {
    try {
      await moduleDef.destroy?.();
    } catch {
      /* tested separately */
    }
    mocks.handlers.clear();
    vi.clearAllMocks();
  });

  it('bounds Workspace IPC delivery with sender-owned acknowledgements and releases subscriptions on stop', async () => {
    const unsubscribe = vi.fn();
    const source: GoalWorkflowEventSource = {
      epoch: '11111111-1111-4111-8111-111111111111',
      init: vi.fn(async () => {}),
      head: vi.fn(async () => ({ first: 1, last: 0 })),
      read: vi.fn(async () => []),
      snapshot: vi.fn(async () => null),
      subscribe: vi.fn(() => unsubscribe),
      dispose: vi.fn(async () => {}),
    };
    Object.assign(fake.instance, { workflowRuntime: { goalEvents: async () => source } });
    await moduleDef.register(createFakeContext());
    const sender = Object.assign(new EventEmitter(), {
      id: 7,
      send: vi.fn(),
      isDestroyed: () => false,
    });
    const start = mocks.handlers.get(AIChannels.RUNTIME_WORKSPACE_START)!;
    const ack = mocks.handlers.get(AIChannels.RUNTIME_WORKSPACE_ACK)!;
    const stop = mocks.handlers.get(AIChannels.RUNTIME_WORKSPACE_STOP)!;
    expect(await start({ sender }, { streamId: 'workspace-1', identityId: 'other' })).toMatchObject(
      { ok: false, error: { code: 'VALIDATION_ERROR' } },
    );
    expect(await start({ sender }, { streamId: 'workspace-1' })).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalled());
    const payload = sender.send.mock.calls[0]![1] as { event: { cursor: string } };
    expect(
      await ack({ sender: { id: 8 } }, { streamId: 'workspace-1', cursor: payload.event.cursor }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await ack({ sender }, { streamId: 'workspace-1', cursor: 'wrong' })).toMatchObject({
      ok: true,
      data: { accepted: false },
    });
    expect(
      await ack({ sender }, { streamId: 'workspace-1', cursor: payload.event.cursor }),
    ).toMatchObject({ ok: true, data: { accepted: true } });
    expect(await stop({ sender: { id: 8 } }, { streamId: 'workspace-1' })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(await stop({ sender }, { streamId: 'workspace-1' })).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
    expect(sender.listenerCount('destroyed')).toBe(0);
  });

  it('routes Goal surface lease IPC through authenticated identity and rejects identity injection', async () => {
    const grant = {
      status: 'claimed',
      token: '11111111-1111-4111-8111-111111111111',
      fence: 2,
      expiresAt: Date.now() + 30_000,
    };
    const goalSurfaceLease = vi.fn(async () => grant);
    Object.assign(fake.instance, {
      workflowRuntime: { goalSurfaceLease },
    });
    await moduleDef.register(createFakeContext());
    const handler = mocks.handlers.get(AIChannels.RUNTIME_WORKFLOW_GOAL_SURFACE_LEASE)!;
    const request = { action: 'claim', runId: 'goal-run-1' };
    expect(await handler(undefined, request)).toMatchObject({ ok: true, data: grant });
    expect(goalSurfaceLease).toHaveBeenCalledExactlyOnceWith({
      identityId: 'identity-1',
      request,
    });
    const rejected = await handler(undefined, {
      action: 'claim',
      runId: 'goal-run-1',
      identityId: 'other',
    });
    expect(rejected).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(goalSurfaceLease).toHaveBeenCalledTimes(1);
  });

  it('registers only current product + Mastra runtime channels', async () => {
    await moduleDef.register(createFakeContext());
    expect([...mocks.handlers.keys()].sort()).toEqual([...CURRENT_CHANNELS].sort());
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(mocks.handlers.has('ai:agent:run:start')).toBe(false);
    expect(mocks.handlers.has('ai:assistant:dispatch:start')).toBe(false);
    expect(mocks.handlers.has('ai:chat:message:stream:start')).toBe(false);
  });

  it('awaits native ask_user reply over Desktop IPC before serializing accepted', async () => {
    await moduleDef.register(createFakeContext());
    const command = {
      type: 'tool_answer',
      action: 'answer',
      conversationId: 'conversation-1',
      runId: 'run-1',
      toolCallId: 'tool-1',
      answer: 'A',
    };
    const result = await mocks.handlers.get(AIChannels.RUNTIME_ASSISTANT_ANSWER)!(
      undefined,
      command,
    );
    expect(fake.answerToolSuspension).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ identityId: 'identity-1' }),
        command,
      }),
    );
    expect(result).toEqual(ok({ accepted: true }));
  });

  it('routes permission settings through authenticated IPC and rejects owner injection', async () => {
    const permissions = vi.fn(async () => ({
      settings: { preset: 'on_demand', agentPresets: {}, revision: 1 },
      rules: [],
      audit: [],
    }));
    Object.assign(fake.instance, { localAgentRuntime: { permissions } });
    await moduleDef.register(createFakeContext());
    const handler = mocks.handlers.get(AIChannels.LOCAL_AGENT)!;
    expect(
      await handler(undefined, { action: 'permissions', command: { action: 'snapshot' } }),
    ).toMatchObject({ ok: true });
    expect(permissions).toHaveBeenCalledExactlyOnceWith('identity-1', { action: 'snapshot' });
    expect(
      await handler(undefined, {
        action: 'permissions',
        command: { action: 'snapshot', owner: 'foreign' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(permissions).toHaveBeenCalledTimes(1);
  });

  it('routes native title CAS through authenticated IPC and rejects identity injection', async () => {
    const renameConversation = vi.fn(async () => ({
      id: 'conversation-1',
      name: 'Title',
      version: 3,
    }));
    Object.assign(fake.instance, { localAgentRuntime: { renameConversation } });
    await moduleDef.register(createFakeContext());
    const handler = mocks.handlers.get(AIChannels.LOCAL_AGENT)!;
    const request = {
      action: 'rename_conversation',
      id: 'conversation-1',
      name: ' <Title> ',
      expectedVersion: 1,
    };
    expect(await handler(undefined, request)).toMatchObject({ ok: true });
    expect(renameConversation).toHaveBeenCalledExactlyOnceWith(
      'identity-1',
      'conversation-1',
      'Title',
      1,
      undefined,
    );
    expect(await handler(undefined, { ...request, identityId: 'foreign' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(renameConversation).toHaveBeenCalledTimes(1);
  });

  it('passes validated archive updates and archive discovery through Desktop IPC', async () => {
    await moduleDef.register(createFakeContext());
    const update = mocks.handlers.get(AIChannels.CONVERSATION_UPDATE)!;
    expect(await update(undefined, { id: 'conversation-1', status: 'Archived' })).toMatchObject({
      ok: true,
    });
    expect(fake.assistantConversation.updateConversation).toHaveBeenCalledWith(
      'conversation-1',
      { status: 'Archived' },
      expect.objectContaining({ identityId: 'identity-1' }),
    );
    const list = mocks.handlers.get(AIChannels.CONVERSATION_LIST)!;
    await list(undefined, { status: 'Archived', page: 2, pageSize: 100 });
    expect(fake.assistantConversation.listConversations).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-1' }),
      2,
      100,
      'Archived',
    );
  });

  it('routes product IPC through the matching capability port', async () => {
    await moduleDef.register(createFakeContext());
    const handler = mocks.handlers.get(AIChannels.PROVIDER_LIST)!;
    const result = await handler(undefined, undefined);
    expect(result).toMatchObject({ ok: true });
    expect(fake.providerManagement.listProviders).toHaveBeenCalledTimes(1);
  });

  it('restricts attention list and acknowledgements to the authenticated owner and valid runtime kind', async () => {
    const ctx = createFakeContext();
    await moduleDef.register(ctx);
    const list = mocks.handlers.get(AIChannels.RUNTIME_ASSISTANT_ATTENTION_LIST)!;
    const ack = mocks.handlers.get(AIChannels.RUNTIME_ASSISTANT_ATTENTION_ACK)!;
    expect(
      await list(undefined, { runtimeKind: 'local_agent', conversationIds: ['native-1'] }),
    ).toMatchObject({ ok: true, data: { items: [] } });
    expect(fake.attentionPort.list).toHaveBeenCalledWith({
      identityId: 'identity-1',
      runtimeKind: 'local_agent',
      conversationIds: ['native-1'],
    });
    expect(
      await ack(undefined, {
        runtimeKind: 'local_agent',
        conversationId: 'native-1',
        revision: 3,
      }),
    ).toMatchObject({ ok: true, data: { acknowledged: true } });
    expect(fake.attentionPort.acknowledge).toHaveBeenCalledWith({
      identityId: 'identity-1',
      runtimeKind: 'local_agent',
      conversationId: 'native-1',
      revision: 3,
    });
    for (const payload of [
      { runtimeKind: 'local_agent', conversationIds: ['native-1'], identityId: 'forged' },
      { runtimeKind: 'unsupported', conversationIds: ['native-1'] },
      { runtimeKind: 'builtin', conversationIds: Array.from({ length: 101 }, (_, i) => String(i)) },
    ]) {
      expect(await list(undefined, payload)).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    }
    for (const payload of [
      { runtimeKind: 'local_agent', conversationId: 'native-1', revision: 0 },
      { runtimeKind: 'local_agent', conversationId: 'native-1', revision: 3, identityId: 'forged' },
    ]) {
      expect(await ack(undefined, payload)).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    }
    expect(fake.attentionPort.list).toHaveBeenCalledTimes(1);
    expect(fake.attentionPort.acknowledge).toHaveBeenCalledTimes(1);
    vi.mocked(ctx.auth.requireRequestContext).mockRejectedValueOnce(new Error('unauthorized'));
    expect(await list(undefined, { conversationIds: ['native-1'] })).toMatchObject({ ok: false });
    expect(fake.attentionPort.list).toHaveBeenCalledTimes(1);
  });

  it('does not route local conversation history into Mastra when local execution is unavailable', async () => {
    await moduleDef.register(createFakeContext());
    const result = await mocks.handlers.get(AIChannels.RUNTIME_ASSISTANT_HISTORY)!(undefined, {
      runtimeKind: 'local_agent',
      conversationId: 'native-local-conversation',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
  });

  it('routes Provider onboarding IPC through authenticated identity-bound application methods', async () => {
    await moduleDef.register(createFakeContext());
    const request = { catalogId: 'openai', apiKey: 'sk-test' };
    const handler = mocks.handlers.get(AIChannels.PROVIDER_ONBOARDING_PROBE)!;
    const result = await handler(undefined, request);
    expect(result).toMatchObject({ ok: true });
    expect(fake.providerManagement.probeProviderConnection).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ identityId: 'identity-1' }),
    );
  });

  it('routes Provider replacement IPC through the identity-bound one-time replacement contract', async () => {
    await moduleDef.register(createFakeContext());
    const probePayload = {
      providerId: 'provider-1',
      request: { catalogId: 'custom', baseUrl: 'https://provider.example/v1', apiKey: 'sk-new' },
    };
    const probeHandler = mocks.handlers.get(AIChannels.PROVIDER_REPLACEMENT_PROBE)!;
    expect(await probeHandler(undefined, probePayload)).toMatchObject({ ok: true });
    expect(fake.providerManagement.probeProviderReplacement).toHaveBeenCalledWith(
      'provider-1',
      probePayload.request,
      expect.objectContaining({ identityId: 'identity-1' }),
    );

    const commitPayload = {
      providerId: 'provider-1',
      request: { onboardingId: 'onboarding-replacement-123456', defaultModelId: 'model-1' },
    };
    const commitHandler = mocks.handlers.get(AIChannels.PROVIDER_REPLACEMENT_COMMIT)!;
    expect(await commitHandler(undefined, commitPayload)).toMatchObject({ ok: true });
    expect(fake.providerManagement.commitProviderReplacement).toHaveBeenCalledWith(
      'provider-1',
      commitPayload.request,
      expect.objectContaining({ identityId: 'identity-1' }),
    );
  });

  it('binds tool approval IPC to host identity and validates the same strict command as HTTP', async () => {
    const ctx = createFakeContext();
    await moduleDef.register(ctx);
    const handler = mocks.handlers.get(AIChannels.RUNTIME_ASSISTANT_APPROVAL)!;
    const command = {
      type: 'tool_approval',
      conversationId: 'c',
      runId: 'r',
      toolCallId: 't',
      decision: 'decline',
    };
    expect(await handler(undefined, command)).toMatchObject({
      ok: true,
      data: { accepted: false },
    });
    expect(fake.decideToolApproval).toHaveBeenCalledWith({
      context: expect.objectContaining({ identityId: 'identity-1' }),
      command,
    });
    expect(await handler(undefined, { ...command, identityId: 'foreign' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(
      await handler(undefined, { ...command, decision: 'always_allow_category' }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(fake.decideToolApproval).toHaveBeenCalledTimes(1);
    vi.mocked(ctx.auth.requireRequestContext).mockRejectedValueOnce(new Error('unauthorized'));
    expect(await handler(undefined, command)).toMatchObject({ ok: false });
    expect(fake.decideToolApproval).toHaveBeenCalledTimes(1);
  });

  it('queries runtime usage through authenticated IPC identity and rejects identity injection', async () => {
    await moduleDef.register(createFakeContext());
    const handler = mocks.handlers.get(AIChannels.RUNTIME_USAGE_GET)!;

    const result = await handler(undefined, { conversationId: 'conversation-1' });
    expect(result).toMatchObject({ ok: true, data: { executionCount: 1, totalTokens: 125 } });
    expect(fake.summarizeUsage).toHaveBeenCalledWith({
      identityId: 'identity-1',
      conversationId: 'conversation-1',
    });

    const rejected = await handler(undefined, {
      conversationId: 'conversation-1',
      identityId: 'attacker-controlled',
    });
    expect(rejected).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(fake.summarizeUsage).toHaveBeenCalledTimes(1);
  });

  it('maps runtime provider failures to the same stable public code as HTTP', async () => {
    const workflowRuntime = {
      start: vi.fn(),
      startDetached: vi.fn(async () => {
        throw new AIExecutionError('capability_unverified', 'provider=server-secret');
      }),
      resume: vi.fn(),
      resumeDetached: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      cancel: vi.fn(),
    };
    fake.instance = { ...fake.instance, workflowRuntime } as AIModuleInstance;
    moduleDef = createAIElectronModule({ instance: fake.instance });
    await moduleDef.register(createFakeContext());

    const handler = mocks.handlers.get(AIChannels.RUNTIME_WORKFLOW_START)!;
    const result = await handler(undefined, {
      kind: 'goal.create',
      conversationId: 'conversation-1',
      input: { idea: 'Run a 5K' },
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'AI_CAPABILITY_UNVERIFIED',
        message: 'The selected AI model capability has not been verified',
      },
    });
    expect(JSON.stringify(result)).not.toContain('server-secret');
  });

  it('is single-register and destroy is idempotent', async () => {
    await moduleDef.register(createFakeContext());
    await expect(moduleDef.register(createFakeContext())).rejects.toThrow(/only register once/);
    await moduleDef.destroy?.();
    expect(mocks.handlers.size).toBe(0);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    await moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('removes only channels owned by this module on destroy', async () => {
    const foreignLegacyChannel = 'ai:agent:run:start';
    mocks.handlers.set(foreignLegacyChannel, vi.fn());
    await moduleDef.register(createFakeContext());
    await moduleDef.destroy?.();
    expect(mocks.handlers.get(foreignLegacyChannel)).toBeDefined();
  });

  it('rolls back installed handlers and disposes when start fails', async () => {
    fake.start.mockRejectedValueOnce(new Error('start failed'));
    await expect(moduleDef.register(createFakeContext())).rejects.toThrow('start failed');
    expect(mocks.handlers.size).toBe(0);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    await expect(moduleDef.register(createFakeContext())).rejects.toThrow(/only register once/);
  });
});
