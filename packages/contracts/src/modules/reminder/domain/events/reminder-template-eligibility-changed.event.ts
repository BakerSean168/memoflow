import type { IdentityId, ReminderTemplateId } from '../../../../primitives';

export type ReminderTemplateEligibilityChangeCause =
  | 'profile-membership'
  | 'profile-membership-state'
  | 'profile-gate'
  | 'global-gate';

/**
 * An external eligibility gate changed without necessarily mutating the
 * ReminderTemplate itself. Consumers must re-read canonical scheduling state.
 */
export interface ReminderTemplateEligibilityChangedEvent {
  identityId: IdentityId;
  templateId: ReminderTemplateId;
  cause: ReminderTemplateEligibilityChangeCause;
}
