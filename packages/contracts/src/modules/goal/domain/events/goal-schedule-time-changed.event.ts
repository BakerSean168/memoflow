import type { GoalServerDTO } from '../../aggregates/goal-server';
import type { IdentityId } from '../../../../primitives';

/**
 * Goal Schedule Time Changed Event
 *
 * Triggered when: Goal planning time changes (start date / target timeframe)
 * Subscribers: Schedule service
 */
export interface GoalScheduleTimeChangedEvent {
  /** User/Identity identifier */
  identityId: IdentityId;

  /** Updated goal snapshot */
  goal: GoalServerDTO;

  /** Changed planning-time fields (`startDate` / `target`) */
  changes: string[];
}
