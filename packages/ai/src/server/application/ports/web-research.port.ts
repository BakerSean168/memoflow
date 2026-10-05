import type { GoalResearchEvidence, GoalResearchIntent } from '@memoflow/contracts/ai';

export interface AIWebResearchCapabilityInput {
  readonly identityId: string;
  readonly providerId?: string;
  readonly modelId?: string;
}

export interface AIWebResearchInput extends AIWebResearchCapabilityInput {
  readonly query: string;
  readonly intent: GoalResearchIntent;
  readonly maxSources: number;
}

export type AIWebResearchResult =
  | {
      readonly status: 'grounded';
      readonly evidence: GoalResearchEvidence;
    }
  | {
      readonly status: 'unavailable';
      readonly reason:
        | 'provider_unsupported'
        | 'provider_unavailable'
        | 'rate_limited'
        | 'search_failed'
        | 'no_sources';
    };

/** Read-only public-web research capability. Never grants product mutation authority. */
export interface IAIWebResearchPort {
  /**
   * Returns whether the selected provider connection has an explicit hosted-search contract.
   * This is a capability check only: it must not consume credentials or perform network search.
   */
  supports(input: AIWebResearchCapabilityInput): Promise<boolean>;
  search(input: AIWebResearchInput): Promise<AIWebResearchResult>;
}
