import { AgentRegistryError } from '../../agent-instance/agent-instance.repository';
import type { AgentInstanceRegistry } from '../../agent-instance/agent-instance.registry';
import { AIExecutionError } from '../../../../shared/ai-execution-error';
import { normalizeOpenAICompatibleModelId } from '../../../shared/openai-compatible-normalize';
import type { AIProviderConfigServerDTO } from '@memoflow/contracts/ai';

import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import type {
  ChatExecutionProviderConfig,
  IAIProviderSecretVault,
  IAIModelSelectionValidationPort,
} from '../../ports';

/**
 * Resolve the provider config that should be used for an AI operation.
 *
 * A few application services need exactly the same policy:
 * 1. respect an explicitly selected provider when it belongs to the caller;
 *    reject that selection when it is unavailable instead of silently switching
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
    if (selectedProvider?.isActive && selectedProvider.deletedAt == null) {
      return selectedProvider;
    }
    // An explicit per-conversation selection is an authority decision. Do not
    // silently switch it to another connection when it is disabled, deleted,
    // missing, or owned by another identity.
    throw new AIExecutionError('provider_unavailable', 'Selected AI provider is unavailable');
  }

  const defaultProvider = await providerConfigRepository.findDefaultByIdentityId(identityId);
  if (defaultProvider?.isActive && defaultProvider.deletedAt == null) {
    return defaultProvider;
  }

  const providers = await providerConfigRepository.findByIdentityId(identityId);
  const activeProvider = providers.find(
    (provider) => provider.isActive && provider.deletedAt == null,
  );
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
  const model = normalizeOpenAICompatibleModelId(
    options?.modelOverride ?? providerConfig.defaultModel ?? '',
  );
  if (!model) {
    throw new AIExecutionError(
      'configuration_required',
      'AI provider model configuration is required',
    );
  }

  return {
    // ProviderDefinition currently exposes the single supported protocol:
    // openai_compatible. AI-9605 owns capability-aware protocol/model routing.
    provider: 'openai',
    model,
    apiKey: credential,
    baseUrl: providerConfig.baseUrl,
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.maxTokens,
  };
}

export async function resolveProviderCredential(
  secretVault: IAIProviderSecretVault,
  identityId: string,
  providerConfig: {
    credentialRef: Parameters<IAIProviderSecretVault['resolve']>[0]['credentialRef'];
  },
): Promise<string> {
  try {
    const credential = await secretVault.resolve({
      identityId,
      credentialRef: providerConfig.credentialRef,
    });
    if (!credential.value.trim()) {
      throw new AIExecutionError('provider_unavailable', 'AI provider credential is unavailable');
    }
    return credential.value;
  } catch (cause) {
    if (cause instanceof AIExecutionError) throw cause;
    throw new AIExecutionError('provider_unavailable', 'AI provider credential is unavailable', {
      cause,
    });
  }
}

/** Reuse Registry authority for conversation-bound and standalone Knowledge operations. */
export async function assertKnowledgeAgentSelection(
  registry: Pick<AgentInstanceRegistry, 'assertModelBinding' | 'assertTurnSelection'> | undefined,
  owner: string,
  input: {
    agentInstanceId?: string;
    conversationId?: string;
    providerId?: string;
    modelId?: string;
  },
  modelSelectionValidation?: IAIModelSelectionValidationPort,
): Promise<void> {
  if (!registry) {
    if (input.agentInstanceId)
      throw new AIExecutionError('configuration_required', 'Agent Registry unavailable');
  }
  if (registry)
    try {
      if (input.conversationId) {
        await registry.assertTurnSelection({
          owner,
          conversationId: input.conversationId,
          agentInstanceId: input.agentInstanceId,
          providerId: input.providerId,
          modelId: input.modelId,
        });
      } else if (input.agentInstanceId) {
        await registry.assertModelBinding(
          owner,
          input.agentInstanceId,
          input.providerId,
          input.modelId,
        );
      }
    } catch (cause) {
      if (!(cause instanceof AgentRegistryError)) throw cause;
      throw new AIExecutionError(
        'configuration_required',
        'Selected Agent instance is unavailable or its model is not bound',
      );
    }
  if (input.agentInstanceId && !modelSelectionValidation)
    throw new AIExecutionError('configuration_required', 'Model selection policy unavailable');
  await modelSelectionValidation?.assertModelSelection({
    identityId: owner,
    agentInstanceId: input.agentInstanceId,
    providerId: input.providerId,
    modelId: input.modelId,
  });
}
