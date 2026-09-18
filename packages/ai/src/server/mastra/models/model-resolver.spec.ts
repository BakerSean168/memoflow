import { describe, expect, it, vi } from 'vitest';
import type {
  AIModelCapabilityMap,
  AIModelCapabilitySnapshot,
  AIModelCatalogSnapshot,
} from '@memoflow/contracts/ai';
import type {
  IAIModelCapabilitySnapshotPort,
  IAIModelCatalogPort,
} from '../../../server/application/ports';
import {
  createAIProviderConfigRepositoryStub,
  createAIProviderConfigServerDTO,
  createAIProviderSecretVaultStub,
} from '../../../testing/ai-test-support';
import { MastraModelResolver } from './model-resolver';

const inertFetch = vi.fn(async () => {
  throw new Error('network must not run in resolver tests');
}) as unknown as typeof fetch;

const verifiedChatOnly: AIModelCapabilityMap = {
  chat: 'verified',
  streaming: 'unknown',
  structuredOutput: 'unknown',
  toolCalling: 'unknown',
  vision: 'unknown',
};

function catalogPort(
  modelIds: readonly string[] = ['model-default', 'model-override', 'selected-model'],
  now: () => number = Date.now,
): IAIModelCatalogPort & { getSnapshot: ReturnType<typeof vi.fn> } {
  return {
    getSnapshot: vi.fn(async (input) => ({
      providerConnectionId:
        input.providerConnectionId as AIModelCatalogSnapshot['providerConnectionId'],
      discoveredAt: now(),
      expiresAt: now() + 60_000,
      source: 'provider_api',
      status: modelIds.length > 0 ? 'available' : 'empty',
      models: modelIds.map((id) => ({ id, name: id })),
    })),
  };
}

function capabilityPort(
  snapshot: AIModelCapabilitySnapshot | null,
): IAIModelCapabilitySnapshotPort {
  return { getSnapshot: vi.fn(async () => snapshot) };
}

function capabilitySnapshot(
  capabilities: AIModelCapabilityMap,
  overrides: Partial<AIModelCapabilitySnapshot> = {},
): AIModelCapabilitySnapshot {
  return {
    providerConnectionId: 'provider-1' as never,
    modelId: 'model-override',
    verifiedAt: 1,
    expiresAt: null,
    provenance: ['runtime_probe'],
    capabilities,
    ...overrides,
  };
}

function createResolver(input: {
  provider?: ReturnType<typeof createAIProviderConfigServerDTO>;
  modelIds?: readonly string[];
  capabilities?: AIModelCapabilitySnapshot | null;
  now?: () => number;
}) {
  const modelCatalog = catalogPort(input.modelIds, input.now);
  const repository = createAIProviderConfigRepositoryStub({
    findByIdForIdentity: async () => input.provider ?? createAIProviderConfigServerDTO(),
    findDefaultByIdentityId: async () => input.provider ?? createAIProviderConfigServerDTO(),
  });
  return {
    modelCatalog,
    resolver: new MastraModelResolver(repository, createAIProviderSecretVaultStub(), inertFetch, {
      modelCatalog,
      capabilitySnapshots: capabilityPort(input.capabilities ?? null),
      now: input.now,
    }),
  };
}

describe('MastraModelResolver', () => {
  it('resolves an explicitly selected provider/model through the authenticated identity lookup', async () => {
    const provider = createAIProviderConfigServerDTO({
      id: 'provider-selected' as never,
      identityId: 'identity-1' as never,
      defaultModel: 'model-default',
    });
    const findByIdForIdentity = vi.fn(async () => provider);
    const modelCatalog = catalogPort(['model-override']);
    const repository = createAIProviderConfigRepositoryStub({ findByIdForIdentity });
    const resolver = new MastraModelResolver(
      repository,
      createAIProviderSecretVaultStub(),
      inertFetch,
      { modelCatalog },
    );

    const resolved = await resolver.resolve({
      identityId: 'identity-1',
      providerId: 'provider-selected',
      modelId: 'model-override',
    });

    expect(findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'provider-selected');
    expect(resolved.providerId).toBe('provider-selected');
    expect(resolved.modelId).toBe('model-override');
    expect(resolved.capabilities).toEqual(verifiedChatOnly);
    expect(resolved.model).toMatchObject({ modelId: 'model-override' });
    expect(JSON.stringify(resolved.model)).not.toContain('server-secret');
    expect((resolved.model as unknown as { config?: { fetch?: unknown } }).config?.fetch).toBe(
      inertFetch,
    );
  });

  it('rejects a disabled explicitly selected provider instead of falling back', async () => {
    const provider = createAIProviderConfigServerDTO({
      id: 'provider-disabled' as never,
      isActive: false,
      isDefault: true,
    });
    const { resolver } = resolverForExplicitProvider(provider);

    await expect(
      resolver.resolve({ identityId: 'identity-1', providerId: 'provider-disabled' }),
    ).rejects.toMatchObject({ category: 'provider_unavailable' });
  });

  it('rejects a deleted explicitly selected provider', async () => {
    const provider = createAIProviderConfigServerDTO({
      id: 'provider-deleted' as never,
      deletedAt: Date.now(),
    });
    const { resolver } = resolverForExplicitProvider(provider);

    await expect(
      resolver.resolve({ identityId: 'identity-1', providerId: 'provider-deleted' }),
    ).rejects.toMatchObject({ category: 'provider_unavailable' });
  });

  it('rejects a provider that is returned outside the authenticated identity', async () => {
    const provider = createAIProviderConfigServerDTO({ identityId: 'identity-2' as never });
    const { resolver } = resolverForExplicitProvider(provider);

    await expect(
      resolver.resolve({ identityId: 'identity-1', providerId: String(provider.id) }),
    ).rejects.toMatchObject({ category: 'provider_unavailable' });
  });

  it('fails closed when the identity has no active provider', async () => {
    const repository = createAIProviderConfigRepositoryStub({
      findDefaultByIdentityId: async () => null,
      findByIdentityId: async () => [],
    });
    const { modelCatalog } = createResolver({});
    const resolver = new MastraModelResolver(
      repository,
      createAIProviderSecretVaultStub(),
      inertFetch,
      { modelCatalog },
    );

    await expect(resolver.resolve({ identityId: 'identity-1' })).rejects.toMatchObject({
      category: 'provider_unavailable',
    });
  });

  it('requires a selected/default model without inventing a model id', async () => {
    const provider = createAIProviderConfigServerDTO({ defaultModel: null });
    const { resolver } = createResolver({ provider });

    await expect(
      resolver.resolve({ identityId: String(provider.identityId) }),
    ).rejects.toMatchObject({
      category: 'configuration_required',
    });
  });

  it('honors a valid per-conversation selected model over the connection default', async () => {
    const { resolver } = createResolver({
      modelIds: ['default-model', 'conversation-model'],
      provider: createAIProviderConfigServerDTO({ defaultModel: 'default-model' }),
    });

    const resolved = await resolver.resolve({
      identityId: 'identity-1',
      modelId: 'conversation-model',
    });

    expect(resolved.modelId).toBe('conversation-model');
  });

  it('rejects structured output when Goal planner evidence marks it unsupported', async () => {
    const { resolver } = createResolver({
      capabilities: capabilitySnapshot({
        ...verifiedChatOnly,
        structuredOutput: 'unsupported',
      }),
    });

    await expect(
      resolver.resolve({
        identityId: 'identity-1',
        modelId: 'model-override',
        executionRequirement: { chat: 'required', structuredOutput: 'required' },
      }),
    ).rejects.toMatchObject({ category: 'capability_unsupported' });
  });

  it('rejects streaming when Assistant evidence marks it unsupported', async () => {
    const { resolver } = createResolver({
      capabilities: capabilitySnapshot({
        ...verifiedChatOnly,
        streaming: 'unsupported',
      }),
    });

    await expect(
      resolver.resolve({
        identityId: 'identity-1',
        modelId: 'model-override',
        executionRequirement: { chat: 'required', streaming: 'required' },
      }),
    ).rejects.toMatchObject({ category: 'capability_unsupported' });
  });

  it('fails closed on unknown required capabilities and permits a fresh manual runtime probe', async () => {
    const unknown = createResolver({
      provider: createAIProviderConfigServerDTO({ defaultModel: 'model-override' }),
      capabilities: capabilitySnapshot(verifiedChatOnly),
    });
    await expect(
      unknown.resolver.resolve({
        identityId: 'identity-1',
        executionRequirement: { chat: 'required', streaming: 'required' },
      }),
    ).rejects.toMatchObject({ category: 'capability_unverified' });

    const manuallyVerified = createResolver({
      modelIds: [],
      provider: createAIProviderConfigServerDTO({ defaultModel: 'manual-model' }),
      capabilities: capabilitySnapshot(
        {
          chat: 'verified',
          streaming: 'verified',
          structuredOutput: 'verified',
          toolCalling: 'verified',
          vision: 'unknown',
        },
        { modelId: 'manual-model' },
      ),
    });
    const resolved = await manuallyVerified.resolver.resolve({
      identityId: 'identity-1',
      modelId: 'manual-model',
      executionRequirement: { chat: 'required', streaming: 'required' },
    });

    expect(resolved.modelId).toBe('manual-model');
    expect(manuallyVerified.modelCatalog.getSnapshot).not.toHaveBeenCalled();
  });

  it('treats an expired capability snapshot as unknown', async () => {
    const { resolver } = createResolver({
      provider: createAIProviderConfigServerDTO({ defaultModel: 'model-override' }),
      capabilities: capabilitySnapshot(
        { ...verifiedChatOnly, streaming: 'verified' },
        { expiresAt: 100 },
      ),
      now: () => 100,
    });

    await expect(
      resolver.resolve({
        identityId: 'identity-1',
        executionRequirement: { chat: 'required', streaming: 'required' },
      }),
    ).rejects.toMatchObject({ category: 'capability_unverified' });
  });

  it('refreshes an expired catalog snapshot instead of reusing it', async () => {
    let now = 1;
    const modelCatalog = {
      getSnapshot: vi.fn(async (input: { providerConnectionId: string; now: number }) => ({
        providerConnectionId:
          input.providerConnectionId as AIModelCatalogSnapshot['providerConnectionId'],
        discoveredAt: input.now,
        expiresAt: input.now + 10,
        source: 'provider_api' as const,
        status: 'available' as const,
        models: [{ id: 'model-override', name: 'model-override' }],
      })),
    } satisfies IAIModelCatalogPort;
    const provider = createAIProviderConfigServerDTO({ defaultModel: 'model-override' });
    const resolver = new MastraModelResolver(
      createAIProviderConfigRepositoryStub({ findDefaultByIdentityId: async () => provider }),
      createAIProviderSecretVaultStub(),
      inertFetch,
      { modelCatalog, now: () => now },
    );

    await resolver.resolve({ identityId: 'identity-1' });
    now = 11;
    await resolver.resolve({ identityId: 'identity-1' });

    expect(modelCatalog.getSnapshot).toHaveBeenCalledTimes(2);
  });
});

function resolverForExplicitProvider(provider: ReturnType<typeof createAIProviderConfigServerDTO>) {
  const modelCatalog = catalogPort([]);
  const repository = createAIProviderConfigRepositoryStub({
    findByIdForIdentity: async () => provider,
    findDefaultByIdentityId: async () => createAIProviderConfigServerDTO(),
  });
  return {
    resolver: new MastraModelResolver(repository, createAIProviderSecretVaultStub(), inertFetch, {
      modelCatalog,
    }),
  };
}
