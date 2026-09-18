import { CommitAIProviderOnboardingUseCase } from './commit-ai-provider-onboarding.use-case';
import { AIProviderOnboardingSessionMemoryRepository } from '../../../infrastructure/adapters/memory/ai-provider-onboarding-session-memory.repository';

const cx = {
  identityId: 'identity-1',
  requestId: 'request-1',
  traceId: 'trace-1',
  startedAt: 1,
  source: 'api',
} as const;

async function sessionFixture(options: { unsupported?: boolean } = {}) {
  const sessions = new AIProviderOnboardingSessionMemoryRepository();
  await sessions.create({
    id: 'onboarding_0123456789abcdef',
    identityId: 'identity-1',
    catalogId: 'custom',
    baseUrl: 'https://llm.example/v1',
    credentialRef: 'credential-test',
    credentialStatus: options.unsupported ? 'requires_model_test' : 'valid',
    discoveryStatus: options.unsupported ? 'unsupported' : 'available',
    models: options.unsupported ? [] : [{ id: 'model-a', name: 'Model A' }],
    expiresAt: 10_000,
    now: 1_000,
  });
  return sessions;
}

describe('CommitAIProviderOnboardingUseCase', () => {
  it('persists only after an explicit discovered model selection', async () => {
    const sessions = await sessionFixture();
    const commit = vi.fn(async () => 'COMMITTED' as const);
    const useCase = new CommitAIProviderOnboardingUseCase(sessions, { commit, replace: vi.fn() }, () => 2_000);

    const result = await useCase.execute(
      {
        onboardingId: 'onboarding_0123456789abcdef',
        name: 'My Provider',
        defaultModelId: 'model-a',
        isDefault: true,
      },
      cx as never,
    );

    expect(result.ok).toBe(true);
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'identity-1',
        onboardingId: 'onboarding_0123456789abcdef',
        provider: expect.objectContaining({
          name: 'My Provider',
          credentialRef: 'credential-test',
          defaultModel: 'model-a',
              }),
      }),
    );
  });

  it('requires a successful model probe when discovery was unsupported', async () => {
    const sessions = await sessionFixture({ unsupported: true });
    const commit = vi.fn(async () => 'COMMITTED' as const);
    const useCase = new CommitAIProviderOnboardingUseCase(sessions, { commit, replace: vi.fn() }, () => 2_000);

    const rejected = await useCase.execute(
      { onboardingId: 'onboarding_0123456789abcdef', name: 'Custom', defaultModelId: 'manual-model' },
      cx as never,
    );
    expect(rejected.ok).toBe(false);
    expect(commit).not.toHaveBeenCalled();

    await sessions.markModelVerified({
      identityId: 'identity-1',
      onboardingId: 'onboarding_0123456789abcdef',
      modelId: 'manual-model',
      now: 2_001,
    });
    const accepted = await useCase.execute(
      { onboardingId: 'onboarding_0123456789abcdef', name: 'Custom', defaultModelId: 'manual-model' },
      cx as never,
    );
    expect(accepted.ok).toBe(true);
  });

  it('fails closed when the atomic port reports a concurrent consume', async () => {
    const sessions = await sessionFixture();
    const useCase = new CommitAIProviderOnboardingUseCase(
      sessions,
      { commit: vi.fn(async () => 'SESSION_UNAVAILABLE' as const), replace: vi.fn() },
      () => 2_000,
    );
    const result = await useCase.execute(
      { onboardingId: 'onboarding_0123456789abcdef', name: 'Provider', defaultModelId: 'model-a' },
      cx as never,
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('refuses a replacement-bound handle even when its model is valid', async () => {
    const sessions = new AIProviderOnboardingSessionMemoryRepository();
    await sessions.create({
      id: 'onboarding_replacement_1234567890',
      identityId: 'identity-1',
      catalogId: 'custom',
      baseUrl: 'https://llm.example/v1',
      targetProviderId: 'provider-existing',
      credentialRef: 'credential-test',
      credentialStatus: 'valid',
      discoveryStatus: 'available',
      models: [{ id: 'model-a', name: 'Model A' }],
      expiresAt: 10_000,
      now: 1_000,
    });
    const commit = vi.fn();
    const useCase = new CommitAIProviderOnboardingUseCase(
      sessions,
      { commit, replace: vi.fn() },
      () => 2_000,
    );

    const result = await useCase.execute(
      {
        onboardingId: 'onboarding_replacement_1234567890',
        name: 'Must Not Create',
        defaultModelId: 'model-a',
      },
      cx as never,
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(commit).not.toHaveBeenCalled();
  });

});
