import type { AIProviderCredentialRef } from '@memoflow/contracts/primitives';

/** Plaintext is intentionally shaped as an edge-only value, not a DTO field. */
export interface ResolvedAIProviderCredential {
  readonly value: string;
}

export interface StoreAIProviderCredentialInput {
  readonly identityId: string;
  readonly value: string;
  readonly expiresAt?: number | null;
}

export interface ResolveAIProviderCredentialInput {
  readonly identityId: string;
  readonly credentialRef: AIProviderCredentialRef;
  readonly now?: number;
}

export interface ReplaceAIProviderCredentialInput extends ResolveAIProviderCredentialInput {
  readonly value: string;
}

/**
 * Host-owned secret storage boundary.
 *
 * Connections and onboarding sessions carry only `credentialRef`. Plaintext is
 * returned only to the request/probe/model execution edge and is never exposed
 * by a repository or ordinary provider DTO.
 */
export interface IAIProviderSecretVault {
  store(input: StoreAIProviderCredentialInput): Promise<AIProviderCredentialRef>;
  resolve(input: ResolveAIProviderCredentialInput): Promise<ResolvedAIProviderCredential>;
  replace(input: ReplaceAIProviderCredentialInput): Promise<void>;
  /** Revocation is idempotent for an owned reference, so retries are safe. */
  revoke(input: ResolveAIProviderCredentialInput): Promise<void>;
}
