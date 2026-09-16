import type { ProfileMembership, RoutineDefinition, RoutineProfile } from './model';

export type RoutineEligibilityReasonCode =
  | 'eligible'
  | 'routine-disabled'
  | 'profile-disabled'
  | 'membership-disabled'
  | 'runtime-context-inactive'
  | 'temporary-override';

export interface RoutineRuntimeContext {
  readonly activeProfileIds: readonly string[];
}

export interface RoutineEligibilityInput {
  readonly routineEnabled: boolean;
  readonly profileEnabled?: boolean;
  readonly membershipEnabled?: boolean;
  readonly runtimeContext?: RoutineRuntimeContext;
  readonly profileId?: string;
  readonly temporaryOverrideAllowsExecution?: boolean;
}

export interface RoutineEligibilityResult {
  readonly eligible: boolean;
  readonly reasonCodes: readonly RoutineEligibilityReasonCode[];
}

export function evaluateRoutineEligibility(
  input: RoutineEligibilityInput,
): RoutineEligibilityResult {
  const reasons: RoutineEligibilityReasonCode[] = [];
  if (!input.routineEnabled) reasons.push('routine-disabled');
  if (input.profileEnabled === false) reasons.push('profile-disabled');
  if (input.membershipEnabled === false) reasons.push('membership-disabled');
  if (
    input.profileId !== undefined &&
    input.runtimeContext !== undefined &&
    !input.runtimeContext.activeProfileIds.includes(input.profileId)
  ) {
    reasons.push('runtime-context-inactive');
  }
  if (input.temporaryOverrideAllowsExecution === false) reasons.push('temporary-override');
  return { eligible: reasons.length === 0, reasonCodes: reasons.length ? reasons : ['eligible'] };
}

export function evaluateRoutineMembershipEligibility(input: {
  routine: RoutineDefinition;
  profile: RoutineProfile;
  membership: ProfileMembership;
  runtimeContext?: RoutineRuntimeContext;
  temporaryOverrideAllowsExecution?: boolean;
}): RoutineEligibilityResult {
  if (
    input.routine.identityId !== input.profile.identityId ||
    input.routine.identityId !== input.membership.identityId ||
    input.routine.id !== input.membership.routineId ||
    input.profile.id !== input.membership.profileId
  ) {
    throw new TypeError('Routine/profile/membership ownership mismatch');
  }
  return evaluateRoutineEligibility({
    routineEnabled: input.routine.enabled,
    profileEnabled: input.profile.enabled,
    membershipEnabled: input.membership.enabled,
    runtimeContext: input.runtimeContext,
    profileId: input.profile.id,
    temporaryOverrideAllowsExecution: input.temporaryOverrideAllowsExecution,
  });
}
