import type { AIProviderCredentialProbeStrategy } from '@memoflow/ai-contracts';

export interface ProviderCredentialProbeInput {
  readonly strategy: AIProviderCredentialProbeStrategy;
  readonly baseUrl: string;
  readonly apiKey: string;
}

/** Provider-specific credential verification that is stronger than model discovery. */
export interface IAIProviderCredentialProbePort {
  validate(input: ProviderCredentialProbeInput): Promise<void>;
}
