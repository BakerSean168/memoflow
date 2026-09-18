import { describe, expect, it, vi } from 'vitest';
import {
  createAIProviderConfigRepositoryStub,
  createAIProviderConfigServerDTO,
  createAIProviderSecretVaultStub,
} from '../../../testing/ai-test-support';
import { MastraModelResolver } from './model-resolver';

const inertFetch = vi.fn(async () => { throw new Error('network must not run in resolver tests'); }) as unknown as typeof fetch;

describe('MastraModelResolver', () => {
  it('resolves an explicitly selected provider only through the authenticated identity lookup', async () => {
    const provider = createAIProviderConfigServerDTO({
      id: 'provider-selected' as never,
      identityId: 'identity-1' as never,
      defaultModel: 'model-default',
    });
    const findByIdForIdentity = vi.fn(async () => provider);
    const repository = createAIProviderConfigRepositoryStub({ findByIdForIdentity });
    const resolver = new MastraModelResolver(repository, createAIProviderSecretVaultStub(), inertFetch);

    const resolved = await resolver.resolve({
      identityId: 'identity-1',
      providerId: 'provider-selected',
      modelId: 'model-override',
    });

    expect(findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'provider-selected');
    expect(resolved.providerId).toBe('provider-selected');
    expect(resolved.modelId).toBe('model-override');
    expect(resolved.model).toMatchObject({
      modelId: 'model-override',
    });
    expect(JSON.stringify(resolved.model)).not.toContain('server-secret');
    expect(
      (resolved.model as unknown as { config?: { fetch?: unknown } }).config?.fetch,
    ).toBe(inertFetch);
  });

  it('never selects an inactive requested provider and falls back only within the same identity', async () => {
    const inactive = createAIProviderConfigServerDTO({
      id: 'provider-inactive' as never,
      identityId: 'identity-1' as never,
      isActive: false,
    });
    const activeDefault = createAIProviderConfigServerDTO({
      id: 'provider-default' as never,
      identityId: 'identity-1' as never,
      isActive: true,
      isDefault: true,
    });
    const findByIdForIdentity = vi.fn(async () => inactive);
    const findDefaultByIdentityId = vi.fn(async () => activeDefault);
    const repository = createAIProviderConfigRepositoryStub({
      findByIdForIdentity,
      findDefaultByIdentityId,
    });
    const resolver = new MastraModelResolver(repository, createAIProviderSecretVaultStub(), inertFetch);

    const resolved = await resolver.resolve({
      identityId: 'identity-1',
      providerId: 'provider-inactive',
    });

    expect(findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'provider-inactive');
    expect(findDefaultByIdentityId).toHaveBeenCalledWith('identity-1');
    expect(resolved.providerId).toBe('provider-default');
  });

  it('fails closed when the identity has no active provider', async () => {
    const repository = createAIProviderConfigRepositoryStub({
      findDefaultByIdentityId: async () => null,
      findByIdentityId: async () => [],
    });
    const resolver = new MastraModelResolver(repository, createAIProviderSecretVaultStub(), inertFetch);

    await expect(resolver.resolve({ identityId: 'identity-1' })).rejects.toMatchObject({
      category: 'provider_unavailable',
    });
  });

  it('requires an explicit or default model without inventing a model id', async () => {
    const provider = createAIProviderConfigServerDTO({ defaultModel: null });
    const repository = createAIProviderConfigRepositoryStub({
      findDefaultByIdentityId: async () => provider,
    });
    const resolver = new MastraModelResolver(repository, createAIProviderSecretVaultStub(), inertFetch);

    await expect(resolver.resolve({ identityId: String(provider.identityId) })).rejects.toThrow(
      /has no selected model/,
    );
  });
});
