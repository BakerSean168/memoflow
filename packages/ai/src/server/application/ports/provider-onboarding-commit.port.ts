import type { AIProviderConnectionServerDTO } from '@memoflow/ai-contracts';
import type { AIProviderCredentialRef } from '@memoflow/ai-contracts';

export type AIProviderOnboardingCommitOutcome = 'COMMITTED' | 'SESSION_UNAVAILABLE' | 'CONFLICT';
export type AIProviderReplacementCommitOutcome =
  | 'REPLACED'
  | 'SESSION_UNAVAILABLE'
  | 'PROVIDER_NOT_FOUND'
  | 'CONFLICT';

/**
 * Atomic persistence boundary for Provider onboarding and connection replacement.
 * Implementations must consume the one-time session and persist the Provider
 * mutation in one transaction, or roll both actions back.
 */
export interface IAIProviderOnboardingCommitPort {
  commit(input: {
    identityId: string;
    onboardingId: string;
    provider: AIProviderConnectionServerDTO;
    now: number;
  }): Promise<AIProviderOnboardingCommitOutcome>;

  replace(input: {
    identityId: string;
    onboardingId: string;
    targetProviderId: string;
    expectedVersion: number;
    previousCredentialRef: AIProviderCredentialRef;
    replacement: AIProviderConnectionServerDTO;
    now: number;
  }): Promise<AIProviderReplacementCommitOutcome>;
}
