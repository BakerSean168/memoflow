import { AIExecutionError } from '../../../../shared/ai-execution-error';
import { normalizeOpenAICompatibleModelId } from '../../../shared/openai-compatible-normalize';
import type { AIProviderConfigServerDTO } from '@memoflow/contracts/ai';

import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import type { ChatExecutionProviderConfig, IAIProviderSecretVault } from '../../ports';

/**
 * Resolve the provider config that should be used for an AI operation.
 *
 * A few application services need exactly the same policy:
 * 1. respect an explicitly selected provider when it belongs to the caller
 * 2. otherwise use the caller's default provider
 * 3. otherwise fall back to the first active provider
 *
 * Keeping that policy in one place prevents subtle drift between chat,
 * knowledge-note generation, and future AI flows.
 */
export async function resolveActiveProviderConfig(
  providerConfigRepository: IAIProviderConfigRepository,
  identityId: string,
  providerId?: string,
): Promise<AIProviderConfigServerDTO> {
  if (providerId) {
    const selectedProvider = await providerConfigRepository.findByIdForIdentity(
      identityId,
      providerId,
    );
    if (selectedProvider?.isActive) {
      return selectedProvider;
    }
  }

  const defaultProvider = await providerConfigRepository.findDefaultByIdentityId(identityId);
  if (defaultProvider?.isActive) {
    return defaultProvider;
  }

  const providers = await providerConfigRepository.findByIdentityId(identityId);
  const activeProvider = providers.find((provider) => provider.isActive);
  if (!activeProvider) {
    throw new AIExecutionError('provider_unavailable', 'No AI provider configured');
  }

  return activeProvider;
}

/**
 * Translate the stored provider record into the transport-neutral execution
 * config expected by the AI execution port.
 */
export function toChatExecutionProviderConfig(
  providerConfig: {
    defaultModel: string | null;
    baseUrl: string;
  },
  credential: string,
  options?: {
    modelOverride?: string;
    temperature?: number;
    maxTokens?: number;
  },
): ChatExecutionProviderConfig {
  return {
    // ProviderDefinition currently exposes the single supported protocol:
    // openai_compatible. AI-9605 owns capability-aware protocol/model routing.
    provider: 'openai',
    model: normalizeOpenAICompatibleModelId(
      options?.modelOverride ?? providerConfig.defaultModel ?? 'gpt-4o-mini',
    ),
    apiKey: credential,
    baseUrl: providerConfig.baseUrl,
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.maxTokens,
  };
}

export async function resolveProviderCredential(
  secretVault: IAIProviderSecretVault,
  identityId: string,
  providerConfig: { credentialRef: Parameters<IAIProviderSecretVault['resolve']>[0]['credentialRef'] },
): Promise<string> {
  const credential = await secretVault.resolve({
    identityId,
    credentialRef: providerConfig.credentialRef,
  });
  return credential.value;
}
