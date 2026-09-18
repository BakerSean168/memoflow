import { describe, expect, it } from 'vitest';
import type { AIProviderConfigServerDTO } from '@memoflow/contracts/ai';
import { AIProviderConfigMemoryRepository } from '../../../../infrastructure/adapters/memory/ai-provider-config-memory.repository';
import { SetDefaultAIProviderUseCase } from '../set-default-ai-provider.use-case';

function provider(id: string, isDefault = false): AIProviderConfigServerDTO {
  return {
    id: id as AIProviderConfigServerDTO['id'],
    identityId: 'identity-1' as AIProviderConfigServerDTO['identityId'],
    name: id,
    providerDefinitionId: 'openai',
    baseUrl: 'https://api.example.com/v1',
    defaultModel: 'model-1',
    isActive: true,
    isDefault,
    priority: 100,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
  };
}

describe('SetDefaultAIProviderUseCase', () => {
  it('uses one repository operation so concurrent requests leave one identity default', async () => {
    const repository = new AIProviderConfigMemoryRepository();
    await repository.save(provider('provider-1', true));
    await repository.save(provider('provider-2'));
    const useCase = new SetDefaultAIProviderUseCase(repository);

    const [first, second] = await Promise.all([
      useCase.execute('provider-1', { identityId: 'identity-1' }),
      useCase.execute('provider-2', { identityId: 'identity-1' }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(
      (await repository.findByIdentityId('identity-1')).filter((item) => item.isDefault),
    ).toHaveLength(1);
  });

  it('refuses an inactive or foreign provider without clearing the current default', async () => {
    const repository = new AIProviderConfigMemoryRepository();
    await repository.save(provider('provider-1', true));
    await repository.save({ ...provider('provider-2'), isActive: false });
    const useCase = new SetDefaultAIProviderUseCase(repository);

    const result = await useCase.execute('provider-2', { identityId: 'identity-1' });

    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect((await repository.findDefaultByIdentityId('identity-1'))?.id).toBe('provider-1');
  });
});
