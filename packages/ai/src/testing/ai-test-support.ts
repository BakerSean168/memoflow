import type { AIProviderConfigServerDTO } from '@memoflow/contracts/ai';
import type { IdentityId } from '@memoflow/contracts';
import type { AiProviderConfigId, AIProviderCredentialRef } from '@memoflow/contracts/primitives';
import type { IAIProviderSecretVault } from '../server/application/ports';
import type { IAIConversationRepository, IAIProviderConfigRepository } from '../server/domain';
import {
  createAIModule,
  type AIModuleDependencies,
  type AIModuleInstance,
} from '../server/infrastructure';

export function createAIConversationRepositoryStub(
  overrides: Partial<IAIConversationRepository> = {},
): IAIConversationRepository {
  return {
    save: async () => {},
    findByIdForIdentity: async () => null,
    findByIdentityId: async () => [],
    delete: async () => {},
    ...overrides,
  };
}

export function createAIProviderConfigRepositoryStub(
  overrides: Partial<IAIProviderConfigRepository> = {},
): IAIProviderConfigRepository {
  return {
    save: async () => 'SAVED',
    findByIdForIdentity: async () => null,
    findByIdentityId: async () => [],
    findDefaultByIdentityId: async () => null,
    delete: async () => {},
    setDefaultForIdentity: async () => 'NOT_FOUND',
    ...overrides,
  };
}

export function createAIProviderSecretVaultStub(
  initial: Record<string, string> = { credential_test: 'plain-secret' },
): IAIProviderSecretVault {
  const values = new Map<string, { identityId: string; value: string; expiresAt: number | null; revoked: boolean }>(
    Object.entries(initial).map(([ref, value]) => [ref, { identityId: 'identity-1', value, expiresAt: null, revoked: false }]),
  );
  return {
    async store(input) {
      const ref = `credential_test_${values.size}` as AIProviderCredentialRef;
      values.set(ref, { identityId: input.identityId, value: input.value, expiresAt: input.expiresAt ?? null, revoked: false });
      return ref;
    },
    async resolve(input) {
      const value = values.get(String(input.credentialRef));
      if (!value || value.identityId !== input.identityId || value.revoked || (value.expiresAt !== null && value.expiresAt <= (input.now ?? Date.now()))) {
        throw new Error('AI provider credential is unavailable');
      }
      return { value: value.value };
    },
    async replace(input) {
      const value = values.get(String(input.credentialRef));
      if (!value || value.identityId !== input.identityId || value.revoked) throw new Error('AI provider credential is unavailable');
      value.value = input.value;
    },
    async revoke(input) {
      const value = values.get(String(input.credentialRef));
      if (!value || value.identityId !== input.identityId) throw new Error('AI provider credential is unavailable');
      value.revoked = true;
    },
  };
}

export function createAIProviderConfigServerDTO(
  overrides: Partial<AIProviderConfigServerDTO> = {},
): AIProviderConfigServerDTO {
  return {
    id: 'provider-1' as AiProviderConfigId,
    identityId: 'identity-1' as IdentityId,
    name: 'Main provider',
    providerDefinitionId: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    credentialRef: 'credential_test' as AIProviderCredentialRef,
    defaultModel: 'gpt-4o-mini',
    isActive: true,
    isDefault: true,
    priority: 100,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    ...overrides,
  };
}

export function createAIModuleForTests(
  overrides: Partial<AIModuleDependencies> = {},
): AIModuleInstance {
  return createAIModule({
    conversationRepository: createAIConversationRepositoryStub(),
    providerConfigRepository: createAIProviderConfigRepositoryStub(),
    providerSecretVault: createAIProviderSecretVaultStub(),
    ...overrides,
  });
}
