import type {
  AIModelInfo,
  AIProviderDefinitionId,
  ProbeAIProviderConnectionRes,
} from '@memoflow/contracts/ai';
import type { AIProviderCredentialRef } from '@memoflow/contracts/primitives';

export type AIProviderOnboardingCredentialStatus = ProbeAIProviderConnectionRes['credential']['status'];
export type AIProviderOnboardingDiscoveryStatus = ProbeAIProviderConnectionRes['discovery']['status'];

export interface AIProviderOnboardingSessionRecord {
  readonly id: string;
  readonly identityId: string;
  readonly catalogId: AIProviderDefinitionId;
  readonly baseUrl: string;
  /** Null for create onboarding; set for credential/endpoint replacement. */
  readonly targetProviderId: string | null;
  /** Opaque reference into the host-owned SecretVault. */
  readonly credentialRef: AIProviderCredentialRef;
  readonly credentialStatus: AIProviderOnboardingCredentialStatus;
  readonly discoveryStatus: AIProviderOnboardingDiscoveryStatus;
  readonly models: readonly AIModelInfo[];
  readonly verifiedModelIds: readonly string[];
  readonly expiresAt: number;
  readonly consumedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CreateAIProviderOnboardingSessionInput {
  readonly id: string;
  readonly identityId: string;
  readonly catalogId: AIProviderDefinitionId;
  readonly baseUrl: string;
  readonly targetProviderId?: string | null;
  readonly credentialRef: AIProviderCredentialRef;
  readonly credentialStatus: AIProviderOnboardingCredentialStatus;
  readonly discoveryStatus: AIProviderOnboardingDiscoveryStatus;
  readonly models: readonly AIModelInfo[];
  readonly expiresAt: number;
  readonly now: number;
}

export interface IAIProviderOnboardingSessionRepository {
  create(input: CreateAIProviderOnboardingSessionInput): Promise<void>;
  findUsable(identityId: string, onboardingId: string, now: number): Promise<AIProviderOnboardingSessionRecord | null>;
  markModelVerified(input: {
    identityId: string;
    onboardingId: string;
    modelId: string;
    now: number;
  }): Promise<AIProviderOnboardingSessionRecord | null>;
  markConsumed(input: {
    identityId: string;
    onboardingId: string;
    now: number;
  }): Promise<boolean>;
}
