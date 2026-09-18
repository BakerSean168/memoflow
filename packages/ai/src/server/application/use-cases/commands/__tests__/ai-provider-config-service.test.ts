import { describe, expect, it, vi } from 'vitest';

import type { TestAIProviderReq } from '@memoflow/contracts/ai';

import type {
  ChatExecutionCompleteInput,
  ChatExecutionCompleteResult,
  IAIChatExecutionPort,
} from '../../../ports';
import type { IAIProviderConfigRepository } from '../../../../domain/repositories/i-ai-provider-config-repository';
import { TestAIProviderConnectionUseCase } from '../test-ai-provider-connection.use-case';
import { createAIProviderSecretVaultStub } from '../../../../../testing';

class StubProviderConfigRepository {
  constructor(
    private readonly provider: {
      id: string;
      identityId: string;
      name: string;
      providerDefinitionId: string;
      baseUrl: string;
      defaultModel: string | null;
      isActive: boolean;
      isDefault: boolean;
      priority: number;
      version: number;
      createdAt: number;
      updatedAt: number;
      deletedAt: null;
    },
  ) {}

  async findByIdForIdentity(identityId: string, id: string) {
    if (this.provider.id !== id || this.provider.identityId !== identityId) {
      return null;
    }
    return { ...this.provider, credentialRef: 'credential_test' };
  }

  async findByIdentityId() {
    return [this.provider];
  }

  async findDefaultByIdentityId() {
    return this.provider;
  }

  async save() {
    return 'SAVED' as const;
  }
  async delete(): Promise<void> {}
  async setDefaultForIdentity() {
    return 'NOT_FOUND' as const;
  }
}

class StubChatExecutionPort implements IAIChatExecutionPort {
  public readonly complete = vi.fn<
    (input: ChatExecutionCompleteInput) => Promise<ChatExecutionCompleteResult>
  >(async () => ({
    content: 'Provider connection ok',
    finishReason: 'stop',
    usage: {
      promptTokens: 5,
      completionTokens: 3,
      totalTokens: 8,
    },
  }));
}

describe('TestAIProviderConnectionUseCase', () => {
  it('tests a saved provider through the shared execution port', async () => {
    const executionPort = new StubChatExecutionPort();
    const useCase = new TestAIProviderConnectionUseCase(
      new StubProviderConfigRepository({
        id: 'provider-1',
        identityId: 'identity-1',
        name: 'Main provider',
        providerDefinitionId: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        isActive: true,
        isDefault: true,
        priority: 100,
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      }) as unknown as IAIProviderConfigRepository,
      executionPort,
      createAIProviderSecretVaultStub(),
    );

    const result = await useCase.execute({
      providerId: 'provider-1' as TestAIProviderReq['providerId'],
    }, { identityId: 'identity-1' });

    expect(executionPort.complete).toHaveBeenCalledWith({
      identityId: 'identity-1',
      providerConfig: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'plain-secret',
        baseUrl: 'https://api.openai.com/v1',
        temperature: 0.2,
        maxTokens: undefined,
      },
      messages: [{ role: 'user', content: 'Hello, this is a test.' }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        ok: true,
        response: 'Provider connection ok',
        model: 'gpt-4o-mini',
        latencyMs: expect.any(Number),
      });
    }
  });

  it('returns error result for provider owned by another identity', async () => {
    const useCase = new TestAIProviderConnectionUseCase(
      new StubProviderConfigRepository({
        id: 'provider-1',
        identityId: 'someone-else',
        name: 'Foreign provider',
        providerDefinitionId: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        isActive: true,
        isDefault: true,
        priority: 100,
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      }) as unknown as IAIProviderConfigRepository,
      new StubChatExecutionPort(),
      createAIProviderSecretVaultStub(),
    );

    const result = await useCase.execute({
      providerId: 'provider-1' as TestAIProviderReq['providerId'],
    }, { identityId: 'identity-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ok).toBe(false);
      expect(result.data.error).toBe('Provider not found');
    }
  });
});
