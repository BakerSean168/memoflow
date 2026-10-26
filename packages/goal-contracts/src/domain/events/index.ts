/**
 * Goal Module - Domain Events
 *
 * All domain event types for the Goal module
 */

export type { GoalCreatedEvent } from './goal-created.event';
export type { GoalUpdatedEvent } from './goal-updated.event';
export type { GoalStatusChangedEvent } from './goal-status-changed.event';
export type { GoalCompletedEvent } from './goal-completed.event';
export type { GoalArchivedEvent } from './goal-archived.event';
export type { GoalDeletedEvent } from './goal-deleted.event';
export type { GoalScheduleTimeChangedEvent } from './goal-schedule-time-changed.event';
export type { GoalReminderConfigChangedEvent } from './goal-reminder-config-changed.event';

export type { KeyResultAddedEvent } from './key-result-added.event';
export type { KeyResultUpdatedEvent } from './key-result-updated.event';
export type { KeyResultDeletedEvent } from './key-result-deleted.event';

export type { ReviewAddedEvent } from './review-added.event';

// Re-export union type
export type { GoalCreatedEvent as GoalDomainEvent } from './goal-created.event';
