import type { GoalResearchIntent } from '@memoflow/contracts/ai';

export interface GoalResearchPolicy {
  readonly enabled: boolean;
  readonly scope: readonly GoalResearchIntent[];
  readonly maxRequestsPerPlan: number;
  readonly maxSourcesPerRequest: number;
}

/**
 * Product-owned policy for bounded Goal research.
 *
 * This is intentionally separate from provider capability. A research port may
 * exist in every composition root while product policy still decides whether
 * Goal planning is allowed to request external evidence.
 */
export const GOAL_RESEARCH_POLICY = {
  enabled: true,
  scope: ['requirements', 'timeline', 'resources'],
  maxRequestsPerPlan: 3,
  maxSourcesPerRequest: 6,
} as const satisfies GoalResearchPolicy;

export function isGoalResearchIntentAllowed(
  policy: GoalResearchPolicy,
  intent: GoalResearchIntent,
): boolean {
  return policy.enabled && policy.scope.includes(intent);
}
