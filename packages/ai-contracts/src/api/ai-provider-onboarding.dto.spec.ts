import { UpdateAIProviderConfigSchema, TestAIProviderSchema } from './ai-provider-config.dto';
import {
  AI_PROVIDER_CATALOG,
  CommitAIProviderOnboardingSchema,
  ProbeAIProviderConnectionSchema,
} from '../index';

describe('AI Provider Onboarding V2 contracts', () => {
  it('keeps catalog recommendations separate from persisted default model selection', () => {
    expect(AI_PROVIDER_CATALOG).toHaveLength(5);
    expect(AI_PROVIDER_CATALOG.map((entry) => entry.id)).toEqual([
      'openrouter',
      'openai',
      'gemini',
      'deepseek',
      'custom',
    ]);
    for (const entry of AI_PROVIDER_CATALOG) {
      expect(entry).toHaveProperty('recommendedModelIds');
      expect(entry).not.toHaveProperty('defaultModel');
    }
  });

  it('probes a connection without requiring a model', () => {
    expect(
      ProbeAIProviderConnectionSchema.parse({
        catalogId: 'openrouter',
        apiKey: 'sk-test',
      }),
    ).toEqual({ catalogId: 'openrouter', apiKey: 'sk-test' });
  });

  it('commits only a one-time onboarding handle plus explicit model selection', () => {
    const parsed = CommitAIProviderOnboardingSchema.parse({
      onboardingId: 'onboarding_0123456789abcdef',
      name: 'My OpenRouter',
      defaultModelId: 'openai/gpt-4.1-mini',
      isDefault: true,
    });
    expect(parsed.defaultModelId).toBe('openai/gpt-4.1-mini');
    expect(parsed).not.toHaveProperty('apiKey');
    expect(parsed).not.toHaveProperty('baseUrl');
  });
});

describe('Provider onboarding V2 secret-bearing request boundary', () => {
  it('allows raw apiKey only on the initial probe request', () => {
    expect(
      ProbeAIProviderConnectionSchema.safeParse({
        catalogId: 'openai',
        apiKey: 'sk-secret',
      }).success,
    ).toBe(true);
    expect(
      CommitAIProviderOnboardingSchema.safeParse({
        onboardingId: 'onboarding-1234567890',
        name: 'OpenAI',
        defaultModelId: 'gpt-5-mini',
        apiKey: 'must-not-be-accepted',
      }).success,
    ).toBe(false);
  });

  it('rejects raw secret and endpoint fields on saved-provider metadata updates', () => {
    expect(
      UpdateAIProviderConfigSchema.safeParse({
        name: 'renamed',
        apiKey: 'secret',
      }).success,
    ).toBe(false);
    expect(
      UpdateAIProviderConfigSchema.safeParse({
        baseUrl: 'https://evil.example/v1',
      }).success,
    ).toBe(false);
    expect(UpdateAIProviderConfigSchema.safeParse({ model: 'hidden-model' }).success).toBe(false);
    expect(UpdateAIProviderConfigSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('tests saved providers by providerId only, never by raw connection material', () => {
    expect(
      TestAIProviderSchema.safeParse({
        providerId: '550e8400-e29b-41d4-a716-446655440000',
        apiKey: 'secret',
      }).success,
    ).toBe(false);
    expect(
      TestAIProviderSchema.safeParse({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'secret',
        model: 'model-1',
      }).success,
    ).toBe(false);
    expect(
      TestAIProviderSchema.safeParse({
        providerId: '550e8400-e29b-41d4-a716-446655440000',
      }).success,
    ).toBe(true);
  });
});
