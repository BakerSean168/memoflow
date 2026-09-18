import { describe, expect, it } from 'vitest';
import { AIProviderOnboardingSessionMemoryRepository } from '../ai-provider-onboarding-session-memory.repository';

function sessionRepository() {
  const repository = new AIProviderOnboardingSessionMemoryRepository();
  return {
    repository,
    input: {
      id: 'onboarding_1234567890',
      identityId: 'identity-1',
      catalogId: 'openai' as const,
      baseUrl: 'https://api.openai.com/v1',
      targetProviderId: null,
      credentialRef: 'credential-onboarding',
      credentialStatus: 'valid' as const,
      discoveryStatus: 'available' as const,
      models: [{ id: 'gpt-4o-mini', name: 'gpt-4o-mini' }],
      expiresAt: 1_000,
      now: 100,
    },
  };
}

describe('AIProviderOnboardingSessionMemoryRepository', () => {
  it('keeps onboarding state opaque and identity-bound', async () => {
    const { repository, input } = sessionRepository();
    await repository.create(input);

    const record = await repository.findUsable('identity-1', input.id, 500);
    expect(record).toMatchObject({ credentialRef: 'credential-onboarding' });
    expect(JSON.stringify(record)).not.toContain('plain-secret');
    await expect(repository.findUsable('identity-2', input.id, 500)).resolves.toBeNull();
  });

  it('expires and consumes a handle exactly once, making retry fail closed', async () => {
    const first = sessionRepository();
    await first.repository.create(first.input);

    await expect(
      first.repository.markConsumed({
        identityId: 'identity-1',
        onboardingId: first.input.id,
        now: 1_000,
      }),
    ).resolves.toBe(false);
    await expect(
      first.repository.markConsumed({
        identityId: 'identity-1',
        onboardingId: first.input.id,
        now: 900,
      }),
    ).resolves.toBe(true);
    await expect(
      first.repository.markConsumed({
        identityId: 'identity-1',
        onboardingId: first.input.id,
        now: 900,
      }),
    ).resolves.toBe(false);
    await expect(
      first.repository.findUsable('identity-1', first.input.id, 900),
    ).resolves.toBeNull();

    const expired = sessionRepository();
    await expired.repository.create({
      ...expired.input,
      id: 'onboarding_expired_123',
      expiresAt: 200,
    });
    await expect(
      expired.repository.findUsable('identity-1', 'onboarding_expired_123', 200),
    ).resolves.toBeNull();
  });
});
