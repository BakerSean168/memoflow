/**
 * Governance development/diagnostic surface policy (GOV-1902).
 *
 * Governance remains a real routed feature in every build. This policy controls
 * only whether normal product navigation advertises it. A production diagnostic
 * build may opt in explicitly without changing package ownership or route
 * registration.
 */
export interface GovernanceSurfacePolicyInput {
  isDevelopment: boolean;
  diagnosticSurfaceEnabled: boolean;
}

export interface GovernanceSurfacePolicy {
  routeRegistered: true;
  navigationVisible: boolean;
}

export function resolveGovernanceSurfacePolicy(
  input: GovernanceSurfacePolicyInput,
): GovernanceSurfacePolicy {
  return {
    routeRegistered: true,
    navigationVisible: input.isDevelopment || input.diagnosticSurfaceEnabled,
  };
}

export const governanceSurfacePolicy = resolveGovernanceSurfacePolicy({
  isDevelopment: import.meta.env.DEV,
  diagnosticSurfaceEnabled: import.meta.env.VITE_ENABLE_GOVERNANCE_DEV_SURFACE === 'true',
});

/**
 * Keep a direct/deep-linked Governance route self-describing even when normal
 * production navigation hides the entry point.
 */
export function shouldRenderGovernanceSegment(
  active: 'notes' | 'governance',
  policy: GovernanceSurfacePolicy = governanceSurfacePolicy,
): boolean {
  return policy.navigationVisible || active === 'governance';
}
