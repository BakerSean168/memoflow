import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AICapabilities,
  AIProviderConfigClientDTO,
  ExpandKnowledgeRes,
  TestAIProviderReq,
  TestAIProviderRes,
} from '@memoflow/contracts/ai';
import { ok } from '@memoflow/contracts/result';
import { AI_CLIENT_KEY } from '../../../di/keys';
import { useAI } from './useAI';

type AIClientStub = {
  listProviders: ReturnType<typeof vi.fn>;
  getCapabilities: ReturnType<typeof vi.fn>;
  testProvider: ReturnType<typeof vi.fn>;
  expandKnowledge: ReturnType<typeof vi.fn>;
};

function createProvider(
  overrides: Partial<AIProviderConfigClientDTO> = {},
): AIProviderConfigClientDTO {
  return {
    id: 'provider-1' as AIProviderConfigClientDTO['id'],
    identityId: 'identity-1' as AIProviderConfigClientDTO['identityId'],
    name: 'Primary Provider',
    providerDefinitionId: 'openai',
    providerDefinitionId: 'openai',
    baseUrl: 'https://api.example.com/v1',
    credentialRef: 'credential-test',
    defaultModel: 'gpt-4.1-mini',
    isActive: true,
    isDefault: true,
    priority: 1,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

function createCapabilities(
  overrides: Partial<AICapabilities> = {},
): AICapabilities {
  return {
    runtimeMode: 'mastra',
    supportsChat: true,
    supportsKnowledgeNotes: true,
    supportsKnowledgeQuery: true,
    supportsKnowledgeReindex: true,
    supportsAnalyticsQuery: true,
    supportsAssistantRuntime: true,
    supportsWorkflowRuntime: true,
    supportsEvaluationReports: false,
    ...overrides,
  };
}

function createExpandKnowledgeResult(): ExpandKnowledgeRes {
  return {
    expandedContent: 'Expanded note content',
    citations: [],
    providerId: 'provider-1' as ExpandKnowledgeRes['providerId'],
    tokenUsage: {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    },
    processingTimeMs: 120,
    matchedResourceCount: 2,
  };
}

function createClientStub(overrides: Partial<AIClientStub> = {}): AIClientStub {
  return {
    listProviders: vi.fn(),
    getCapabilities: vi.fn(),
    testProvider: vi.fn(),
    expandKnowledge: vi.fn(),
    ...overrides,
  };
}

function mountComposable(clientOverrides: Partial<AIClientStub> = {}) {
  let composable!: ReturnType<typeof useAI>;
  const client = createClientStub(clientOverrides);

  mount(
    defineComponent({
      setup() {
        composable = useAI();
        return () => h('div');
      },
    }),
    {
      global: {
        provide: {
          [AI_CLIENT_KEY as symbol]: client,
        },
      },
    },
  );

  return { composable, client };
}

describe('useAI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps provider results strongly typed at the composable seam', async () => {
    const providers = [createProvider(), createProvider({ id: 'provider-2' as AIProviderConfigClientDTO['id'], isDefault: false })];
    const { composable, client } = mountComposable({
      listProviders: vi.fn().mockResolvedValue(ok(providers)),
    });

    const loadedProviders: AIProviderConfigClientDTO[] = await composable.loadProviders();

    expect(client.listProviders).toHaveBeenCalledTimes(1);
    expect(loadedProviders).toEqual(providers);
    expect(composable.providers.value).toEqual(providers);
    expect(composable.hasProviders.value).toBe(true);
  });

  it('keeps capabilities and provider test responses strongly typed', async () => {
    const capabilities = createCapabilities();
    const providerTestResult: TestAIProviderRes = {
      ok: true,
      response: 'pong',
      model: 'gpt-4.1-mini',
      latencyMs: 42,
    };
    const expandKnowledgeResult = createExpandKnowledgeResult();
    const { composable, client } = mountComposable({
      getCapabilities: vi.fn().mockResolvedValue(ok(capabilities)),
      testProvider: vi.fn().mockResolvedValue(ok(providerTestResult)),
      expandKnowledge: vi.fn().mockResolvedValue(ok(expandKnowledgeResult)),
    });
    const request: TestAIProviderReq = {
      providerId: 'provider-1' as TestAIProviderReq['providerId'],
    };

    const loadedCapabilities: AICapabilities = await composable.loadCapabilities();
    const loadedTestResult: TestAIProviderRes = await composable.testProvider(request);
    const expanded = await composable.expandKnowledge({ instruction: 'Expand this note' });

    expect(client.getCapabilities).toHaveBeenCalledTimes(1);
    expect(loadedCapabilities).toEqual(capabilities);
    expect(composable.capabilities.value).toEqual(capabilities);
    expect(client.testProvider).toHaveBeenCalledWith(request);
    expect(loadedTestResult).toEqual(providerTestResult);
    expect(expanded).toEqual(expandKnowledgeResult);
  });
});
