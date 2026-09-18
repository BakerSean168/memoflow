import { createOpenAICompatible } from '@ai-sdk/openai-compatible-v6';
import type { MastraModelConfig } from '@mastra/core/llm';
import {
  AI_MODEL_CAPABILITIES,
  AIModelCapabilitySnapshotSchema,
  AIModelCatalogSnapshotSchema,
  getAIProviderModelCapabilityDefinition,
  getAIProviderCatalogEntry,
  type AIExecutionRequirement,
  type AIModelCapabilityMap,
  type AIModelCapabilitySnapshot,
  type AIModelCatalogSnapshot,
} from '@memoflow/contracts/ai';
import type { IAIProviderConfigRepository } from '../../domain/repositories/i-ai-provider-config-repository';
import {
  resolveActiveProviderConfig,
  resolveProviderCredential,
} from '../../application/use-cases/commands/ai-provider-resolution';
import type {
  IAIModelCapabilitySnapshotPort,
  IAIModelCatalogPort,
  IAIProviderModelCatalogPort,
  IAIProviderSecretVault,
} from '../../application/ports';
import { OpenAICompatibleModelCatalogGateway } from '../../infrastructure/gateways/openai-compatible-model-catalog.gateway';
import {
  ProviderSafeFetch,
  type ProviderFetch,
} from '../../infrastructure/security/provider-safe-fetch';
import { AIExecutionError } from '../../../shared/ai-execution-error';
import { normalizeOpenAICompatibleModelId } from '../../shared/openai-compatible-normalize';

export interface ResolvedAIModel {
  readonly providerId: string;
  readonly providerName: string;
  readonly modelId: string;
  readonly capabilities: AIModelCapabilityMap;
  readonly model: MastraModelConfig;
}

function createDefaultProviderFetch(): ProviderFetch {
  return new ProviderSafeFetch().fetch;
}

const DEFAULT_CATALOG_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CAPABILITY_EVIDENCE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Production default evidence for the exact known models in the product-owned
 * ProviderDefinition catalog. It deliberately returns no evidence for custom
 * or unknown ids; those models need an injected provider/runtime verification
 * port before capabilities beyond chat can be used.
 */
const DEFAULT_CAPABILITY_SNAPSHOT_PORT: IAIModelCapabilitySnapshotPort = {
  getSnapshot: async (input) => {
    const definition = getAIProviderModelCapabilityDefinition(
      input.providerDefinitionId,
      input.modelId,
    );
    if (!definition) return null;

    return {
      providerConnectionId:
        input.providerConnectionId as AIModelCapabilitySnapshot['providerConnectionId'],
      modelId: input.modelId,
      verifiedAt: input.now,
      expiresAt: input.now + DEFAULT_CAPABILITY_EVIDENCE_TTL_MS,
      provenance: ['provider_catalog'],
      capabilities: definition.capabilities,
    };
  },
};

function createDefaultModelCatalog(providerFetch: ProviderFetch): IAIModelCatalogPort {
  const providerCatalog: IAIProviderModelCatalogPort = new OpenAICompatibleModelCatalogGateway(
    providerFetch,
  );

  return {
    async getSnapshot(input) {
      const models = await providerCatalog.listModels({
        baseUrl: input.baseUrl,
        apiKey: input.credential,
      });
      return {
        providerConnectionId:
          input.providerConnectionId as AIModelCatalogSnapshot['providerConnectionId'],
        discoveredAt: input.now,
        expiresAt: input.now + DEFAULT_CATALOG_TTL_MS,
        source: 'provider_api',
        status: models.length > 0 ? 'available' : 'empty',
        models,
      };
    },
  };
}

function defaultCapabilities(modelListed: boolean): AIModelCapabilityMap {
  return {
    // A model returned by the provider's model endpoint is executable chat
    // inventory. Other capabilities still require explicit evidence.
    chat: modelListed ? 'verified' : 'unknown',
    streaming: 'unknown',
    structuredOutput: 'unknown',
    toolCalling: 'unknown',
    vision: 'unknown',
  };
}

function isFresh(expiresAt: number | null, now: number): boolean {
  return expiresAt === null || expiresAt > now;
}

function isRuntimeProbed(
  snapshot: AIModelCapabilitySnapshot,
  manualModelFallbackAllowed: boolean,
): boolean {
  return (
    manualModelFallbackAllowed &&
    snapshot.provenance.includes('runtime_probe') &&
    snapshot.capabilities.chat === 'verified'
  );
}

function normalizeRequirement(requirement?: AIExecutionRequirement): AIExecutionRequirement {
  return { chat: 'required', ...requirement };
}

/**
 * Keep a resolved SDK model fail-closed after the request-scoped resolver has
 * returned. The AI SDK retains the injected fetch for the lifetime of a run,
 * so each provider request must re-check the connection and its Vault value;
 * otherwise a revoked/replaced credential could continue to be used.
 */
function createCredentialCheckedProviderFetch(input: {
  readonly providerFetch: ProviderFetch;
  readonly providers: IAIProviderConfigRepository;
  readonly secretVault: IAIProviderSecretVault;
  readonly identityId: string;
  readonly providerId: string;
  readonly baseUrl: string;
  readonly credentialRef: Parameters<IAIProviderSecretVault['resolve']>[0]['credentialRef'];
  readonly credential: string;
}): ProviderFetch {
  return (async (request, init) => {
    let currentProvider: Awaited<ReturnType<IAIProviderConfigRepository['findByIdForIdentity']>>;
    try {
      currentProvider = await input.providers.findByIdForIdentity(
        input.identityId,
        input.providerId,
      );
    } catch (cause) {
      throw new AIExecutionError('provider_unavailable', 'AI provider is unavailable', { cause });
    }

    if (
      !currentProvider ||
      String(currentProvider.identityId) !== input.identityId ||
      !currentProvider.isActive ||
      currentProvider.deletedAt != null ||
      String(currentProvider.credentialRef) !== String(input.credentialRef) ||
      currentProvider.baseUrl !== input.baseUrl
    ) {
      throw new AIExecutionError('provider_unavailable', 'AI provider is unavailable');
    }

    const currentCredential = await resolveProviderCredential(
      input.secretVault,
      input.identityId,
      { credentialRef: input.credentialRef },
    );
    if (currentCredential !== input.credential) {
      throw new AIExecutionError('provider_unavailable', 'AI provider credential changed during execution');
    }

    return input.providerFetch(request, init);
  }) as ProviderFetch;
}

function assertRequiredCapabilities(
  modelId: string,
  capabilities: AIModelCapabilityMap,
  requirement: AIExecutionRequirement,
): void {
  for (const capability of AI_MODEL_CAPABILITIES) {
    if (requirement[capability] !== 'required') continue;
    const state = capabilities[capability];
    if (state === 'unsupported') {
      throw new AIExecutionError(
        'capability_unsupported',
        `AI model ${modelId} does not support required capability ${capability}`,
      );
    }
    if (state !== 'verified') {
      throw new AIExecutionError(
        'capability_unverified',
        `AI model ${modelId} has no verified capability ${capability}`,
      );
    }
  }
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
  private readonly modelCatalog: IAIModelCatalogPort;
  private readonly capabilitySnapshots: IAIModelCapabilitySnapshotPort;
  private readonly now: () => number;
  private readonly catalogTtlMs: number;
  private readonly catalogCache = new Map<
    string,
    { readonly snapshot: AIModelCatalogSnapshot; readonly expiresAt: number }
  >();

  constructor(
    private readonly providers: IAIProviderConfigRepository,
    private readonly secretVault: IAIProviderSecretVault,
    private readonly providerFetch: ProviderFetch = createDefaultProviderFetch(),
    options: {
      readonly modelCatalog?: IAIModelCatalogPort;
      readonly capabilitySnapshots?: IAIModelCapabilitySnapshotPort;
      readonly now?: () => number;
      readonly catalogTtlMs?: number;
    } = {},
  ) {
    this.modelCatalog = options.modelCatalog ?? createDefaultModelCatalog(providerFetch);
    this.capabilitySnapshots = options.capabilitySnapshots ?? DEFAULT_CAPABILITY_SNAPSHOT_PORT;
    this.now = options.now ?? Date.now;
    this.catalogTtlMs = options.catalogTtlMs ?? DEFAULT_CATALOG_TTL_MS;
  }

  async resolve(input: {
    identityId: string;
    providerId?: string | null;
    modelId?: string | null;
    executionRequirement?: AIExecutionRequirement;
  }): Promise<ResolvedAIModel> {
    const provider = await resolveActiveProviderConfig(
      this.providers,
      input.identityId,
      input.providerId ?? undefined,
    );
    if (String(provider.identityId) !== input.identityId) {
      throw new AIExecutionError('provider_unavailable', 'Selected AI provider is unavailable');
    }
    const providerDefinition = getAIProviderCatalogEntry(provider.providerDefinitionId);
    if (!providerDefinition || providerDefinition.protocol !== 'openai_compatible') {
      throw new AIExecutionError(
        'configuration_required',
        'AI provider configuration requires a supported provider definition',
      );
    }

    const modelId = normalizeOpenAICompatibleModelId(
      input.modelId?.trim() || provider.defaultModel?.trim() || '',
    );
    if (!modelId) {
      throw new AIExecutionError(
        'configuration_required',
        'AI provider model configuration is required',
      );
    }

    const credential = await resolveProviderCredential(
      this.secretVault,
      input.identityId,
      provider,
    );

    const now = this.now();
    const capabilitySnapshot = await this.readCapabilitySnapshot({
      providerConnectionId: String(provider.id),
      providerDefinitionId: provider.providerDefinitionId,
      modelId,
      now,
    });
    const manuallyVerified = capabilitySnapshot
      ? isRuntimeProbed(capabilitySnapshot, providerDefinition.capabilities.manualModelFallback)
      : false;
    const catalog = manuallyVerified
      ? null
      : await this.readCatalogSnapshot({
          providerConnectionId: String(provider.id),
          baseUrl: provider.baseUrl,
          credential: credential,
          credentialRef: String(provider.credentialRef),
          now,
        });
    const modelListed =
      catalog?.models.some((model) => normalizeOpenAICompatibleModelId(model.id) === modelId) ??
      false;

    if (!manuallyVerified && !modelListed) {
      throw new AIExecutionError(
        'configuration_required',
        'AI provider model configuration requires a discovered or manually verified model',
      );
    }

    const capabilities = capabilitySnapshot?.capabilities ?? defaultCapabilities(modelListed);
    const requirement = normalizeRequirement(input.executionRequirement);
    assertRequiredCapabilities(modelId, capabilities, requirement);

    const sdkProvider = createOpenAICompatible({
      name: 'memoflow-byok',
      baseURL: provider.baseUrl,
      apiKey: credential,
      fetch: createCredentialCheckedProviderFetch({
        providerFetch: this.providerFetch,
        providers: this.providers,
        secretVault: this.secretVault,
        identityId: input.identityId,
        providerId: String(provider.id),
        baseUrl: provider.baseUrl,
        credentialRef: provider.credentialRef,
        credential,
      }),
      supportsStructuredOutputs: capabilities.structuredOutput === 'verified',
    });

    return {
      providerId: provider.id,
      providerName: provider.name,
      modelId,
      capabilities,
      model: sdkProvider.chatModel(modelId) as unknown as MastraModelConfig,
    };
  }

  private async readCatalogSnapshot(input: {
    providerConnectionId: string;
    baseUrl: string;
    credential: string;
    credentialRef: string;
    now: number;
  }): Promise<AIModelCatalogSnapshot> {
    const cacheKey = `${input.providerConnectionId}:${input.baseUrl}:${input.credentialRef}`;
    const cached = this.catalogCache.get(cacheKey);
    if (cached && cached.expiresAt > input.now && isFresh(cached.snapshot.expiresAt, input.now)) {
      return cached.snapshot;
    }

    let snapshot: AIModelCatalogSnapshot;
    try {
      snapshot = AIModelCatalogSnapshotSchema.parse(
        await this.modelCatalog.getSnapshot({
          providerConnectionId: input.providerConnectionId,
          baseUrl: input.baseUrl,
          credential: input.credential,
          now: input.now,
        }),
      ) as AIModelCatalogSnapshot;
    } catch (cause) {
      if (cause instanceof AIExecutionError) throw cause;
      throw new AIExecutionError(
        'provider_unavailable',
        'AI provider model catalog is unavailable',
        {
          cause,
        },
      );
    }

    if (
      snapshot.providerConnectionId !== input.providerConnectionId ||
      !isFresh(snapshot.expiresAt, input.now)
    ) {
      throw new AIExecutionError(
        'configuration_required',
        'AI provider model catalog must be refreshed before model execution',
      );
    }

    const expiresAt = snapshot.expiresAt ?? input.now + this.catalogTtlMs;
    this.catalogCache.set(cacheKey, { snapshot, expiresAt });
    return snapshot;
  }

  private async readCapabilitySnapshot(input: {
    providerConnectionId: string;
    providerDefinitionId: string;
    modelId: string;
    now: number;
  }): Promise<AIModelCapabilitySnapshot | null> {
    let snapshot: AIModelCapabilitySnapshot | null;
    try {
      const value = await this.capabilitySnapshots.getSnapshot(input);
      snapshot = value
        ? (AIModelCapabilitySnapshotSchema.parse(value) as AIModelCapabilitySnapshot)
        : null;
    } catch (cause) {
      throw new AIExecutionError(
        'provider_unavailable',
        'AI model capability verification is unavailable',
        { cause },
      );
    }

    if (!snapshot) return null;
    if (
      snapshot.providerConnectionId !== input.providerConnectionId ||
      normalizeOpenAICompatibleModelId(snapshot.modelId) !== input.modelId ||
      !isFresh(snapshot.expiresAt, input.now)
    ) {
      return null;
    }
    return snapshot;
  }
}
