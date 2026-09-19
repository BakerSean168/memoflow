import { describe, expect, it, vi } from 'vitest';
import type { AIProviderConfigServerDTO } from '@memoflow/contracts/ai';
import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import type { IAIProviderModelCatalogPort } from '../../ports';
import { RefreshAIProviderModelsUseCase } from './refresh-ai-provider-models.use-case';
import { createAIProviderSecretVaultStub } from '../../../../testing';

function provider(): AIProviderConfigServerDTO {
  return {
    id: 'provider-1' as AIProviderConfigServerDTO['id'],
    identityId: 'identity-1' as AIProviderConfigServerDTO['identityId'],
    name: 'OpenRouter',
    providerDefinitionId: 'openrouter',
    providerDefinitionId: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    credentialRef: 'credential_test',
    defaultModel: 'openai/gpt-5',
    isActive: true,
    isDefault: true,
    priority: 100,
    version: 7,
    createdAt: 1,
    updatedAt: 2,
    deletedAt: null,
  };
}

describe('RefreshAIProviderModelsUseCase', () => {
  it('returns an ephemeral catalog snapshot and never mutates Provider state', async () => {
    const stored = provider();
    const repository = {
      findByIdForIdentity: vi.fn(async () => stored),
      save: vi.fn(),
    } as unknown as IAIProviderConfigRepository;
    const catalog = {
      listModels: vi.fn(async () => [
        { id: 'openai/gpt-5', name: 'GPT-5' },
        { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2' },
      ]),
    } as unknown as IAIProviderModelCatalogPort;
    const useCase = new RefreshAIProviderModelsUseCase(
      repository,
      catalog,
      createAIProviderSecretVaultStub(),
    );

    const result = await useCase.execute('provider-1', { identityId: 'identity-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.providerId).toBe('provider-1');
    expect(result.data.models).toHaveLength(2);
    expect(result.data.fetchedAt).toEqual(expect.any(Number));
    expect(repository.save).not.toHaveBeenCalled();
    expect(stored.defaultModel).toBe('openai/gpt-5');
    expect(stored.version).toBe(7);
  });

  it('returns NOT_FOUND without attempting discovery', async () => {
    const repository = {
      findByIdForIdentity: vi.fn(async () => null),
      save: vi.fn(),
    } as unknown as IAIProviderConfigRepository;
    const catalog = { listModels: vi.fn() } as unknown as IAIProviderModelCatalogPort;
    const useCase = new RefreshAIProviderModelsUseCase(
      repository,
      catalog,
      createAIProviderSecretVaultStub(),
    );

    const result = await useCase.execute('missing', { identityId: 'identity-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    expect(catalog.listModels).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });
});
