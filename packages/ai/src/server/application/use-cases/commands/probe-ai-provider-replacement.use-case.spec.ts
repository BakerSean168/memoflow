import { describe, expect, it, vi } from 'vitest';
import type { AIProviderConfigServerDTO } from '@memoflow/contracts/ai';
import { AIProviderOnboardingSessionMemoryRepository } from '../../../infrastructure/adapters/memory/ai-provider-onboarding-session-memory.repository';
import { ProbeAIProviderConnectionUseCase } from './probe-ai-provider-connection.use-case';
import { ProbeAIProviderReplacementUseCase } from './probe-ai-provider-replacement.use-case';

const cx = { identityId: 'identity-1' } as never;
const current = {
  id: 'provider-1',
  identityId: 'identity-1',
  name: 'Custom',
  providerDefinitionId: 'custom',
  baseUrl: 'https://old.example/v1',
  credentialRef: 'credential-old',
  defaultModel: 'old-model',
  isActive: true,
  isDefault: true,
  priority: 100,
  version: 7,
  createdAt: 1_000,
  updatedAt: 2_000,
  deletedAt: null,
} as AIProviderConfigServerDTO;

describe('ProbeAIProviderReplacementUseCase', () => {
  it('binds the one-time session to the saved Provider and defaults Custom to its current endpoint', async () => {
    const sessions = new AIProviderOnboardingSessionMemoryRepository();
    const probe = new ProbeAIProviderConnectionUseCase({
      sessionRepository: sessions,
      modelCatalog: { listModels: vi.fn(async () => [{ id: 'new-model', name: 'New Model' }]) },
      credentialProbe: { validate: vi.fn(async () => undefined) },
      endpointPolicy: { validate: vi.fn(async () => undefined) },
      secretVault: { store: vi.fn(async () => 'credential-new') } as never,
      now: () => 3_000,
      generateId: () => 'replacement-1234567890',
    });
    const useCase = new ProbeAIProviderReplacementUseCase(
      { findByIdForIdentity: vi.fn(async () => current) } as never,
      probe,
    );

    const result = await useCase.execute(
      'provider-1',
      { catalogId: 'custom', apiKey: 'new-secret' },
      cx,
    );

    expect(result.baseUrl).toBe('https://old.example/v1');
    const session = await sessions.findUsable('identity-1', result.onboardingId, 3_001);
    expect(session).toMatchObject({
      targetProviderId: 'provider-1',
      baseUrl: 'https://old.example/v1',
      credentialRef: 'credential-new',
    });
  });

  it('fails before probing when the target Provider does not belong to the identity', async () => {
    const probe = { execute: vi.fn() };
    const useCase = new ProbeAIProviderReplacementUseCase(
      { findByIdForIdentity: vi.fn(async () => null) } as never,
      probe as never,
    );

    await expect(
      useCase.execute('other-provider', { catalogId: 'openai', apiKey: 'secret' }, cx),
    ).rejects.toMatchObject({ category: 'not_found' });
    expect(probe.execute).not.toHaveBeenCalled();
  });
});
