import type { GoalServerDTO } from '../../aggregates/goal-server';
import type { IdentityId } from '@memoflow/shared-primitives';

/**
 * Goal Created Event
 *
 * Triggered when: New goal is created
 * Subscribers: Goal read models, User statistics, Notification service
 *
 * Note: aggregateId (goalId) is automatically set by the domain event system.
 * Note: occurredAt timestamp is automatically set by the domain event system.
 */
export interface GoalCreatedEvent {
  /** User/Identity identifier */
  identityId: IdentityId;

  /** Created goal snapshot */
  goal: GoalServerDTO;
}
