import { TestAIProviderOnboardingModelUseCase } from './test-ai-provider-onboarding-model.use-case';
import { AIProviderOnboardingSessionMemoryRepository } from '../../../infrastructure/adapters/memory/ai-provider-onboarding-session-memory.repository';

const cx = {
  identityId: 'identity-1', requestId: 'request-1', traceId: 'trace-1', startedAt: 1, source: 'api',
} as const;

describe('TestAIProviderOnboardingModelUseCase', () => {
  it('upgrades a manual-fallback session only after a real model call succeeds', async () => {
    const sessions = new AIProviderOnboardingSessionMemoryRepository();
    await sessions.create({
      id: 'onboarding_0123456789abcdef', identityId: 'identity-1', catalogId: 'custom',
      baseUrl: 'https://llm.example/v1', credentialRef: 'credential-test', credentialStatus: 'requires_model_test',
      discoveryStatus: 'unsupported', models: [], expiresAt: 10_000, now: 1_000,
    });
    const complete = vi.fn(async () => ({
      content: 'OK', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }));
    let now = 2_000;
    const useCase = new TestAIProviderOnboardingModelUseCase(
      sessions,
      { complete, stream: vi.fn() as never },
      { resolve: vi.fn(async () => ({ value: 'secret' })) } as never,
      () => now++,
    );

    const result = await useCase.execute(
      { onboardingId: 'onboarding_0123456789abcdef', modelId: 'manual-model' },
      cx as never,
    );
    expect(result).toMatchObject({ ok: true, data: { ok: true, modelId: 'manual-model' } });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      providerConfig: expect.objectContaining({ baseUrl: 'https://llm.example/v1', apiKey: 'secret', model: 'manual-model' }),
    }));
    expect((await sessions.findUsable('identity-1', 'onboarding_0123456789abcdef', 2_010))?.credentialStatus).toBe('valid');
  });
});
