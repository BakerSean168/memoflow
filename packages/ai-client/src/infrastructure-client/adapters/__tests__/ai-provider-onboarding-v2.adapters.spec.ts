import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts/result';
import { AIChannels } from '@memoflow/desktop-contracts';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import { AIProviderConfigHttpAdapter } from '../http/ai-provider-config-http.adapter';
import { AIProviderConfigIpcAdapter } from '../ipc/ai-provider-config-ipc.adapter';

const probe = { catalogId: 'openai' as const, apiKey: 'sk-test' };
const modelTest = {
  onboardingId: 'onboarding-1234567890',
  modelId: 'gpt-5-mini',
};
const commit = {
  onboardingId: 'onboarding-1234567890',
  name: 'OpenAI',
  defaultModelId: 'gpt-5-mini',
  isDefault: true,
};

const replacementProbe = {
  catalogId: 'custom' as const,
  baseUrl: 'https://provider.example/v1',
  apiKey: 'sk-replacement',
};
const replacementCommit = {
  onboardingId: 'onboarding-replacement-1234567890',
  defaultModelId: 'replacement-model',
};

function httpClient() {
  return {
    get: vi.fn(async () => ok([])),
    post: vi.fn(async () => ok({})),
    put: vi.fn(async () => ok({})),
    patch: vi.fn(async () => ok({})),
    delete: vi.fn(async () => ok(undefined)),
    stream: vi.fn(),
  } as unknown as IResultHttpClient;
}

function ipcClient() {
  return {
    invoke: vi.fn(async () => ok({})),
  } as unknown as IResultIpcClient;
}

describe('AI Provider onboarding V2 client adapters', () => {
  it('routes HTTP onboarding calls through the canonical V2 resource paths', async () => {
    const client = httpClient();
    const adapter = new AIProviderConfigHttpAdapter(client);

    await adapter.getProviderCatalog();
    await adapter.probeProviderConnection(probe);
    await adapter.testProviderOnboardingModel(modelTest);
    await adapter.commitProviderOnboarding(commit);
    await adapter.probeProviderReplacement('provider-1', replacementProbe);
    await adapter.commitProviderReplacement('provider-1', replacementCommit);

    expect(client.get).toHaveBeenCalledWith('/ai/provider-catalog');
    expect(client.post).toHaveBeenNthCalledWith(1, '/ai/provider-connections/probe', probe);
    expect(client.post).toHaveBeenNthCalledWith(
      2,
      '/ai/provider-connections/test-model',
      modelTest,
    );
    expect(client.post).toHaveBeenNthCalledWith(3, '/ai/providers', commit);
    expect(client.post).toHaveBeenNthCalledWith(
      4,
      '/ai/providers/provider-1/replacement/probe',
      replacementProbe,
    );
    expect(client.post).toHaveBeenNthCalledWith(
      5,
      '/ai/providers/provider-1/replacement/commit',
      replacementCommit,
    );
  });

  it('routes Desktop onboarding through the same contract over dedicated IPC channels', async () => {
    const client = ipcClient();
    const adapter = new AIProviderConfigIpcAdapter(client);

    await adapter.getProviderCatalog();
    await adapter.probeProviderConnection(probe);
    await adapter.testProviderOnboardingModel(modelTest);
    await adapter.commitProviderOnboarding(commit);
    await adapter.probeProviderReplacement('provider-1', replacementProbe);
    await adapter.commitProviderReplacement('provider-1', replacementCommit);

    expect(client.invoke).toHaveBeenNthCalledWith(1, AIChannels.PROVIDER_CATALOG_GET);
    expect(client.invoke).toHaveBeenNthCalledWith(2, AIChannels.PROVIDER_ONBOARDING_PROBE, probe);
    expect(client.invoke).toHaveBeenNthCalledWith(
      3,
      AIChannels.PROVIDER_ONBOARDING_TEST_MODEL,
      modelTest,
    );
    expect(client.invoke).toHaveBeenNthCalledWith(4, AIChannels.PROVIDER_ONBOARDING_COMMIT, commit);
    expect(client.invoke).toHaveBeenNthCalledWith(5, AIChannels.PROVIDER_REPLACEMENT_PROBE, {
      providerId: 'provider-1',
      request: replacementProbe,
    });
    expect(client.invoke).toHaveBeenNthCalledWith(6, AIChannels.PROVIDER_REPLACEMENT_COMMIT, {
      providerId: 'provider-1',
      request: replacementCommit,
    });
  });
});
