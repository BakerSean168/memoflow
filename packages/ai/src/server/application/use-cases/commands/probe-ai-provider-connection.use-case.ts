import { randomUUID } from 'node:crypto';
import {
  getAIProviderCatalogEntry,
  type ProbeAIProviderConnectionReq,
  type ProbeAIProviderConnectionRes,
} from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { AIExecutionError } from '../../../../shared/ai-execution-error';
import type {
  IAIProviderCredentialProbePort,
  IAIProviderEndpointPolicyPort,
  IAIProviderModelCatalogPort,
  IAIProviderOnboardingSessionRepository,
  IAIProviderSecretVault,
} from '../../ports';

const ONBOARDING_TTL_MS = 10 * 60 * 1000;

export class ProbeAIProviderConnectionUseCase {
  constructor(
    private readonly dependencies: {
      sessionRepository: IAIProviderOnboardingSessionRepository;
      modelCatalog: IAIProviderModelCatalogPort;
      credentialProbe: IAIProviderCredentialProbePort;
      endpointPolicy: IAIProviderEndpointPolicyPort;
      secretVault: IAIProviderSecretVault;
      now?: () => number;
      generateId?: () => string;
    },
  ) {}

  async execute(
    request: ProbeAIProviderConnectionReq,
    cx: ExecutionContext,
    options: { targetProviderId?: string | null } = {},
  ): Promise<ProbeAIProviderConnectionRes> {
    const catalog = getAIProviderCatalogEntry(request.catalogId);
    if (!catalog) throw new AIExecutionError('validation', 'Unknown AI provider catalog entry');

    const baseUrl = resolveBaseUrl(catalog, request.baseUrl);
    await this.dependencies.endpointPolicy.validate({ baseUrl });

    let models: Awaited<ReturnType<IAIProviderModelCatalogPort['listModels']>> = [];
    let credentialStatus: ProbeAIProviderConnectionRes['credential']['status'] = 'valid';
    let discoveryStatus: ProbeAIProviderConnectionRes['discovery']['status'] = 'available';
    const warnings: string[] = [];

    if (catalog.credentialProbeStrategy === 'openrouter_key') {
      await this.dependencies.credentialProbe.validate({
        strategy: catalog.credentialProbeStrategy,
        baseUrl,
        apiKey: request.apiKey,
      });
    }

    try {
      models = await this.dependencies.modelCatalog.listModels({ baseUrl, apiKey: request.apiKey });
      discoveryStatus = models.length ? 'available' : 'empty';
    } catch (error) {
      if (isUnsupportedModelDiscovery(error)) {
        discoveryStatus = 'unsupported';
        warnings.push('This provider does not expose a compatible /models catalog. Enter a Model ID and test it before saving.');
        if (catalog.credentialProbeStrategy !== 'openrouter_key') credentialStatus = 'requires_model_test';
      } else {
        throw error;
      }
    }

    const now = this.dependencies.now?.() ?? Date.now();
    const onboardingId = `onboarding_${this.dependencies.generateId?.() ?? randomUUID()}`;
    const expiresAt = now + ONBOARDING_TTL_MS;
    const credentialRef = await this.dependencies.secretVault.store({
      identityId: cx.identityId,
      value: request.apiKey,
      expiresAt,
    });
    await this.dependencies.sessionRepository.create({
      id: onboardingId,
      identityId: cx.identityId,
      catalogId: catalog.id,
      baseUrl,
      targetProviderId: options.targetProviderId ?? null,
      credentialRef,
      credentialStatus,
      discoveryStatus,
      models,
      expiresAt,
      now,
    });

    return {
      onboardingId,
      expiresAt,
      catalogId: catalog.id,
      baseUrl,
      credential: { status: credentialStatus },
      discovery: { status: discoveryStatus, source: discoveryStatus === 'unsupported' ? 'manual' : 'provider_api' },
      models,
      warnings,
    };
  }
}

function resolveBaseUrl(
  catalog: NonNullable<ReturnType<typeof getAIProviderCatalogEntry>>,
  requested?: string,
): string {
  const supplied = requested?.trim().replace(/\/+$/, '');
  if (catalog.id === 'custom') {
    if (!supplied) throw new AIExecutionError('validation', 'Custom provider requires a Base URL');
    return supplied;
  }
  if (supplied && supplied !== catalog.defaultBaseUrl.replace(/\/+$/, '')) {
    throw new AIExecutionError('validation', 'This provider uses a fixed endpoint; choose Custom to edit Base URL');
  }
  return catalog.defaultBaseUrl.replace(/\/+$/, '');
}

function isUnsupportedModelDiscovery(error: unknown): boolean {
  return error instanceof AIExecutionError && (error.statusCode === 404 || error.statusCode === 405);
}
