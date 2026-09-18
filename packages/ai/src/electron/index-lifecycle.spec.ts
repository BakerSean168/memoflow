import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import type { AIModuleInstance } from '../server/infrastructure';

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
  AIChannels.RUNTIME_ASSISTANT_HISTORY,
  AIChannels.RUNTIME_ASSISTANT_DELETE,
  AIChannels.RUNTIME_USAGE_GET,
  AIChannels.RUNTIME_WORKFLOW_START,
  AIChannels.RUNTIME_WORKFLOW_RESUME,
  AIChannels.RUNTIME_WORKFLOW_GET,
  AIChannels.RUNTIME_WORKFLOW_LIST,
  AIChannels.RUNTIME_WORKFLOW_CANCEL,
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
    mastraRuntime: { summarizeUsage } as never,
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

  it('registers only current product + Mastra runtime channels', async () => {
    await moduleDef.register(createFakeContext());
    expect([...mocks.handlers.keys()].sort()).toEqual([...CURRENT_CHANNELS].sort());
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(mocks.handlers.has('ai:agent:run:start')).toBe(false);
    expect(mocks.handlers.has('ai:assistant:dispatch:start')).toBe(false);
    expect(mocks.handlers.has('ai:chat:message:stream:start')).toBe(false);
  });

  it('routes product IPC through the matching capability port', async () => {
    await moduleDef.register(createFakeContext());
    const handler = mocks.handlers.get(AIChannels.PROVIDER_LIST)!;
    const result = await handler(undefined, undefined);
    expect(result).toMatchObject({ ok: true });
    expect(fake.providerManagement.listProviders).toHaveBeenCalledTimes(1);
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
