import { createOpenAICompatible } from '@ai-sdk/openai-compatible-v6';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { IAIProviderConfigRepository } from '../../domain/repositories/i-ai-provider-config-repository';
import {
  resolveActiveProviderConfig,
  resolveProviderCredential,
} from '../../application/use-cases/commands/ai-provider-resolution';
import type { IAIProviderSecretVault } from '../../application/ports';
import {
  ProviderSafeFetch,
  type ProviderFetch,
} from '../../infrastructure/security/provider-safe-fetch';

export interface ResolvedAIModel {
  readonly providerId: string;
  readonly providerName: string;
  readonly modelId: string;
  readonly model: MastraModelConfig;
}

function createDefaultProviderFetch(): ProviderFetch {
  return new ProviderSafeFetch().fetch;
}

/**
 * Request-scoped BYOK model resolution for the Mastra runtime.
 *
 * Instead of returning Mastra's shorthand `{ url, apiKey }` config (which lets
 * the framework perform unrestricted DNS/fetch itself), MemoFlow constructs the
 * concrete AI SDK OpenAI-compatible language model and injects ProviderSafeFetch.
 * Custom endpoints therefore keep the same HTTPS/SSRF/DNS-rebinding boundary
 * during real Agent/Workflow execution as they had during onboarding.
 */
export class MastraModelResolver {
  constructor(
    private readonly providers: IAIProviderConfigRepository,
    private readonly secretVault: IAIProviderSecretVault,
    private readonly providerFetch: ProviderFetch = createDefaultProviderFetch(),
  ) {}

  async resolve(input: {
    identityId: string;
    providerId?: string | null;
    modelId?: string | null;
  }): Promise<ResolvedAIModel> {
    const provider = await resolveActiveProviderConfig(
      this.providers,
      input.identityId,
      input.providerId ?? undefined,
    );
    const modelId = input.modelId?.trim() || provider.defaultModel?.trim();
    if (!modelId) {
      throw new Error(`AI provider ${provider.id} has no selected model`);
    }
    const credential = await resolveProviderCredential(
      this.secretVault,
      input.identityId,
      provider,
    );

    const sdkProvider = createOpenAICompatible({
      name: 'memoflow-byok',
      baseURL: provider.baseUrl,
      apiKey: credential,
      fetch: this.providerFetch,
      supportsStructuredOutputs: true,
    });

    return {
      providerId: provider.id,
      providerName: provider.name,
      modelId,
      model: sdkProvider.chatModel(modelId) as unknown as MastraModelConfig,
    };
  }
}
