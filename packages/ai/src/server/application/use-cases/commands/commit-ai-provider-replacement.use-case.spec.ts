import { describe, expect, it, vi } from 'vitest';
import type { AIProviderConfigServerDTO } from '@memoflow/contracts/ai';
import { AIProviderOnboardingSessionMemoryRepository } from '../../../infrastructure/adapters/memory/ai-provider-onboarding-session-memory.repository';
import { CommitAIProviderReplacementUseCase } from './commit-ai-provider-replacement.use-case';

const cx = { identityId: 'identity-1' } as never;
const current = {
  id: 'provider-1',
  identityId: 'identity-1',
  name: 'Keep My Name',
  providerDefinitionId: 'custom',
  baseUrl: 'https://old.example/v1',
  credentialRef: 'credential-old',
  defaultModel: 'old-model',
  isActive: true,
  isDefault: true,
  priority: 37,
  version: 7,
  createdAt: 1_000,
  updatedAt: 2_000,
  deletedAt: null,
} as AIProviderConfigServerDTO;

async function replacementSession(targetProviderId: string | null = 'provider-1') {
  const sessions = new AIProviderOnboardingSessionMemoryRepository();
  await sessions.create({
    id: 'onboarding_replacement_1234567890',
    identityId: 'identity-1',
    catalogId: 'custom',
    baseUrl: 'https://new.example/v1',
    targetProviderId,
    credentialRef: 'credential-new',
    credentialStatus: 'valid',
    discoveryStatus: 'available',
    models: [{ id: 'new-model', name: 'New Model' }],
    expiresAt: 10_000,
    now: 3_000,
  });
  return sessions;
}

describe('CommitAIProviderReplacementUseCase', () => {
  it('replaces only connection material while preserving Provider product metadata', async () => {
    const sessions = await replacementSession();
    const replace = vi.fn(async () => 'REPLACED' as const);
    const useCase = new CommitAIProviderReplacementUseCase(
      { findByIdForIdentity: vi.fn(async () => current) } as never,
      sessions,
      { commit: vi.fn(), replace } as never,
      () => 4_000,
    );

    const result = await useCase.execute(
      'provider-1',
      { onboardingId: 'onboarding_replacement_1234567890', defaultModelId: 'new-model' },
      cx,
    );

    expect(result.ok).toBe(true);
    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'identity-1',
        targetProviderId: 'provider-1',
        expectedVersion: 7,
        previousCredentialRef: 'credential-old',
        replacement: expect.objectContaining({
          id: 'provider-1',
          name: 'Keep My Name',
          baseUrl: 'https://new.example/v1',
          credentialRef: 'credential-new',
          defaultModel: 'new-model',
          isDefault: true,
          isActive: true,
          priority: 37,
          version: 8,
          createdAt: 1_000,
          updatedAt: 4_000,
        }),
      }),
    );
  });

  it('rejects a create-only or differently-bound handle before persistence', async () => {
    const sessions = await replacementSession(null);
    const replace = vi.fn();
    const useCase = new CommitAIProviderReplacementUseCase(
      { findByIdForIdentity: vi.fn(async () => current) } as never,
      sessions,
      { commit: vi.fn(), replace } as never,
      () => 4_000,
    );

    const result = await useCase.execute(
      'provider-1',
      { onboardingId: 'onboarding_replacement_1234567890', defaultModelId: 'new-model' },
      cx,
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(replace).not.toHaveBeenCalled();
  });

  it('maps an optimistic replacement race to CONFLICT', async () => {
    const sessions = await replacementSession();
    const useCase = new CommitAIProviderReplacementUseCase(
      { findByIdForIdentity: vi.fn(async () => current) } as never,
      sessions,
      { commit: vi.fn(), replace: vi.fn(async () => 'CONFLICT' as const) } as never,
      () => 4_000,
    );

    const result = await useCase.execute(
      'provider-1',
      { onboardingId: 'onboarding_replacement_1234567890', defaultModelId: 'new-model' },
      cx,
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });
});
