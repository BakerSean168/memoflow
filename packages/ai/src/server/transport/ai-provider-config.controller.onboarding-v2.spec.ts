import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { AIProviderConfigController } from './ai-provider-config.controller';

const cx = { identityId: 'identity-1' } as ExecutionContext;

function service() {
  return {
    getProviderCatalog: vi.fn(async () => ok([])),
    probeProviderConnection: vi.fn(async () => ok({} as never)),
    testProviderOnboardingModel: vi.fn(async () => ok({} as never)),
    commitProviderOnboarding: vi.fn(async () => ok({} as never)),
    updateProvider: vi.fn(async () => ok({} as never)),
    listProviders: vi.fn(async () => ok([])),
    getProvider: vi.fn(async () => ok({} as never)),
    deleteProvider: vi.fn(async () => ok(undefined)),
    testConnection: vi.fn(async () => ok({} as never)),
    setDefaultProvider: vi.fn(async () => ok(undefined)),
    refreshProviderModels: vi.fn(async () => ok({} as never)),
  };
}

describe('AIProviderConfigController onboarding V2 dispatch', () => {
  it('treats onboardingId + explicit model selection as the canonical POST /providers create shape', async () => {
    const fake = service();
    const controller = new AIProviderConfigController(fake);
    const request = {
      onboardingId: 'onboarding-1234567890',
      name: 'OpenAI',
      defaultModelId: 'gpt-5-mini',
      isDefault: true,
    };

    await controller.create(request, cx);

    expect(fake.commitProviderOnboarding).toHaveBeenCalledWith(request, cx);
  });

  it('rejects an invalid onboarding payload without any fallback create path', async () => {
    const fake = service();
    const controller = new AIProviderConfigController(fake);

    const result = await controller.create(
      { onboardingId: 'short', name: 'OpenAI', defaultModelId: '' },
      cx,
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(fake.commitProviderOnboarding).not.toHaveBeenCalled();
  });
});
