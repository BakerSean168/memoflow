import type { GoalResearchEvidence, GoalResearchIntent } from '@memoflow/contracts/ai';

export interface AIWebResearchInput {
  readonly identityId: string;
  readonly providerId?: string;
  readonly modelId?: string;
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
  search(input: AIWebResearchInput): Promise<AIWebResearchResult>;
}
