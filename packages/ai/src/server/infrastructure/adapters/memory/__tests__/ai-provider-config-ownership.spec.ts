import { describe, expect, it } from 'vitest';
import type { AIProviderConfigServerDTO } from '@memoflow/contracts/ai';
import { AIProviderConfigMemoryRepository } from '../ai-provider-config-memory.repository';

function provider(overrides: Partial<AIProviderConfigServerDTO> = {}): AIProviderConfigServerDTO {
  return {
    id: 'provider-1' as AIProviderConfigServerDTO['id'],
    identityId: 'identity-1' as AIProviderConfigServerDTO['identityId'],
    name: 'Main',
    providerDefinitionId: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    credentialRef: 'credential-test',
    defaultModel: 'gpt-4o-mini',
    isActive: true,
    isDefault: true,
    priority: 100,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    ...overrides,
  };
}

describe('AIProviderConfigMemoryRepository ownership', () => {
  it('returns null for foreign identity reads and refuses cross-identity save/delete', async () => {
    const repo = new AIProviderConfigMemoryRepository();
    await repo.save(provider());

    await expect(repo.findByIdForIdentity('identity-other', 'provider-1')).resolves.toBeNull();
    await expect(repo.findByIdForIdentity('identity-1', 'provider-1')).resolves.toMatchObject({
      name: 'Main',
    });

    await expect(
      repo.save(
        provider({ identityId: 'identity-other' as AIProviderConfigServerDTO['identityId'] }),
      ),
    ).rejects.toThrow(/current identity/);
    await expect(repo.delete('identity-other', 'provider-1')).rejects.toThrow(/current identity/);
    await expect(repo.delete('identity-1', 'provider-1')).resolves.toBeUndefined();
    await expect(repo.findByIdForIdentity('identity-1', 'provider-1')).resolves.toBeNull();
  });

  it('uses explicit default selection for the first configured provider', async () => {
    const repo = new AIProviderConfigMemoryRepository();
    await repo.save(provider({ isDefault: false }));

    await expect(repo.findDefaultByIdentityId('identity-1')).resolves.toBeNull();
  });

  it('serializes concurrent default selections and preserves one authoritative default', async () => {
    const repo = new AIProviderConfigMemoryRepository();
    await repo.save(
      provider({ id: 'provider-1' as AIProviderConfigServerDTO['id'], isDefault: false }),
    );
    await repo.save(
      provider({ id: 'provider-2' as AIProviderConfigServerDTO['id'], isDefault: false }),
    );

    const outcomes = await Promise.all([
      repo.setDefaultForIdentity('identity-1', 'provider-1'),
      repo.setDefaultForIdentity('identity-1', 'provider-2'),
    ]);

    expect(outcomes).toEqual(['SET', 'SET']);
    const providers = await repo.findByIdentityId('identity-1');
    expect(providers.filter(({ isDefault }) => isDefault)).toHaveLength(1);
  });

  it('serializes concurrent provider saves that request default', async () => {
    const repo = new AIProviderConfigMemoryRepository();

    const outcomes = await Promise.all([
      repo.save(provider({ id: 'provider-1' as AIProviderConfigServerDTO['id'] })),
      repo.save(provider({ id: 'provider-2' as AIProviderConfigServerDTO['id'] })),
    ]);

    expect(outcomes).toEqual(['SAVED', 'SAVED']);
    const providers = await repo.findByIdentityId('identity-1');
    expect(providers.filter(({ isDefault }) => isDefault)).toHaveLength(1);
  });

  it('does not silently promote another provider when the default is deleted', async () => {
    const repo = new AIProviderConfigMemoryRepository();
    await repo.save(provider({ id: 'provider-1' as AIProviderConfigServerDTO['id'] }));
    await repo.save(
      provider({ id: 'provider-2' as AIProviderConfigServerDTO['id'], isDefault: false }),
    );

    await repo.delete('identity-1', 'provider-1');

    await expect(repo.findDefaultByIdentityId('identity-1')).resolves.toBeNull();
  });
});
