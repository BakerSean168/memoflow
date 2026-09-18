import { describe, expect, it, vi } from 'vitest';
import type { AIProviderConfigServerDTO } from '@memoflow/contracts/ai';
import type { IAIProviderConfigRepository } from '../../../../domain/repositories/i-ai-provider-config-repository';
import { UpdateAIProviderUseCase } from '../update-ai-provider.use-case';

describe('UpdateAIProviderUseCase default invariant', () => {
  it('clears default when the configured provider is disabled', async () => {
    const current: AIProviderConfigServerDTO = {
      id: 'provider-1' as AIProviderConfigServerDTO['id'],
      identityId: 'identity-1' as AIProviderConfigServerDTO['identityId'],
      name: 'Primary',
      providerDefinitionId: 'openai',
      baseUrl: 'https://example.com/v1',
      defaultModel: 'model-1',
      isActive: true,
      isDefault: true,
      priority: 100,
      version: 1,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    };
    const repository = {
      findByIdForIdentity: vi.fn().mockResolvedValue(current),
      save: vi.fn().mockResolvedValue('SAVED'),
    } as unknown as IAIProviderConfigRepository;

    const result = await new UpdateAIProviderUseCase(repository).execute(
      'identity-1',
      'provider-1',
      { isActive: false },
    );

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false, isDefault: false }),
    );
    expect(result.ok && result.data.isDefault).toBe(false);
  });
});
