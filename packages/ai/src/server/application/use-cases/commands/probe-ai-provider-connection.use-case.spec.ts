import { ProbeAIProviderConnectionUseCase } from './probe-ai-provider-connection.use-case';
import { AIExecutionError } from '../../../../shared/ai-execution-error';
import { AIProviderOnboardingSessionMemoryRepository } from '../../../infrastructure/adapters/memory/ai-provider-onboarding-session-memory.repository';

const cx = {
  identityId: 'identity-1',
  requestId: 'request-1',
  traceId: 'trace-1',
  startedAt: 1,
  source: 'api',
} as const;

describe('ProbeAIProviderConnectionUseCase', () => {
  it('discovers models without persisting a Provider and returns a one-time handle', async () => {
    const sessions = new AIProviderOnboardingSessionMemoryRepository();
    const credentialProbe = { validate: vi.fn(async () => undefined) };
    const modelCatalog = {
      listModels: vi.fn(async () => [{ id: 'model-a', name: 'Model A' }]),
    };
    const secretVault = { store: vi.fn(async () => 'credential-test') };
    const useCase = new ProbeAIProviderConnectionUseCase({
      sessionRepository: sessions,
      credentialProbe,
      modelCatalog,
      endpointPolicy: { validate: vi.fn(async () => undefined) },
      secretVault: secretVault as never,
      now: () => 1_000,
      generateId: () => '01234567-89ab-cdef-0123-456789abcdef',
    });

    const result = await useCase.execute({ catalogId: 'openrouter', apiKey: 'secret' }, cx as never);

    expect(credentialProbe.validate).toHaveBeenCalledOnce();
    expect(modelCatalog.listModels).toHaveBeenCalledWith({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'secret',
    });
    expect(result).toMatchObject({
      onboardingId: 'onboarding_01234567-89ab-cdef-0123-456789abcdef',
      expiresAt: 601_000,
      credential: { status: 'valid' },
      discovery: { status: 'available', source: 'provider_api' },
    });
    const stored = await sessions.findUsable('identity-1', result.onboardingId, 1_001);
    expect(stored?.credentialRef).toBe('credential-test');
    expect(secretVault.store).toHaveBeenCalledWith({
      identityId: 'identity-1',
      value: 'secret',
      expiresAt: 601_000,
    });
  });

  it('keeps unsupported custom discovery unpersisted and requires an explicit model test', async () => {
    const sessions = new AIProviderOnboardingSessionMemoryRepository();
    const useCase = new ProbeAIProviderConnectionUseCase({
      sessionRepository: sessions,
      credentialProbe: { validate: vi.fn(async () => undefined) },
      modelCatalog: {
        listModels: vi.fn(async () => {
          throw new AIExecutionError('transport', 'no models route', { statusCode: 404 });
        }),
      },
      endpointPolicy: { validate: vi.fn(async () => undefined) },
      secretVault: { store: vi.fn(async () => 'credential-test') } as never,
      now: () => 2_000,
      generateId: () => 'abcdef01-2345-6789-abcd-ef0123456789',
    });

    const result = await useCase.execute(
      { catalogId: 'custom', baseUrl: 'https://llm.example/v1', apiKey: 'secret' },
      cx as never,
    );

    expect(result.credential.status).toBe('requires_model_test');
    expect(result.discovery.status).toBe('unsupported');
    expect(result.models).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it('rejects endpoint overrides for built-in providers', async () => {
    const useCase = new ProbeAIProviderConnectionUseCase({
      sessionRepository: new AIProviderOnboardingSessionMemoryRepository(),
      credentialProbe: { validate: vi.fn(async () => undefined) },
      modelCatalog: { listModels: vi.fn(async () => []) },
      endpointPolicy: { validate: vi.fn(async () => undefined) },
      secretVault: { store: vi.fn(async () => 'credential-test') } as never,
    });
    await expect(
      useCase.execute(
        { catalogId: 'openai', baseUrl: 'https://evil.example/v1', apiKey: 'secret' },
        cx as never,
      ),
    ).rejects.toMatchObject({ category: 'validation' });
  });
});
