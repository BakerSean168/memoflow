import {
  type AIProviderConfigClientDTO,
  type AIProviderConfigServerDTO,
  type TestAIProviderReq,
} from '@memoflow/contracts/ai';
import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import type { IAIProviderSecretVault } from '../../ports/provider-secret-vault.port';
import { toChatExecutionProviderConfig } from './ai-provider-resolution';

export function toClientDTO(provider: AIProviderConfigServerDTO): AIProviderConfigClientDTO {
  return {
    id: provider.id,
    identityId: provider.identityId,
    name: provider.name,
    providerDefinitionId: provider.providerDefinitionId,
    baseUrl: provider.baseUrl,
    credentialRef: provider.credentialRef,
    defaultModel: provider.defaultModel,
    isActive: provider.isActive,
    isDefault: provider.isDefault,
    priority: provider.priority,
    version: provider.version,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    deletedAt: provider.deletedAt,
  };
}

export async function resolveProviderConfigForConnectionTest(
  providerConfigRepository: IAIProviderConfigRepository,
  secretVault: IAIProviderSecretVault,
  identityId: string,
  request: TestAIProviderReq,
) {
  const provider = await providerConfigRepository.findByIdForIdentity(
    identityId,
    request.providerId,
  );
  if (!provider) {
    throw new Error('Provider not found');
  }

  const credential = await secretVault.resolve({
    identityId,
    credentialRef: provider.credentialRef,
  });

  return toChatExecutionProviderConfig(provider, credential.value, {
    temperature: 0.2,
  });
}
