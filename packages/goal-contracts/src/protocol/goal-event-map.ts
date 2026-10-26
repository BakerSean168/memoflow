import type { GoalCreatedEvent } from '../domain/events/goal-created.event';
import type { GoalUpdatedEvent } from '../domain/events/goal-updated.event';
import type { GoalStatusChangedEvent } from '../domain/events/goal-status-changed.event';
import type { GoalCompletedEvent } from '../domain/events/goal-completed.event';
import type { GoalArchivedEvent } from '../domain/events/goal-archived.event';
import type { GoalDeletedEvent } from '../domain/events/goal-deleted.event';
import type { GoalScheduleTimeChangedEvent } from '../domain/events/goal-schedule-time-changed.event';
import type { GoalReminderConfigChangedEvent } from '../domain/events/goal-reminder-config-changed.event';
import type { KeyResultAddedEvent } from '../domain/events/key-result-added.event';
import type { KeyResultUpdatedEvent } from '../domain/events/key-result-updated.event';
import type { KeyResultDeletedEvent } from '../domain/events/key-result-deleted.event';
import type { ReviewAddedEvent } from '../domain/events/review-added.event';

/**
 * Goal Module - Event Map
 * 目标模块 - 事件映射
 *
 * 事件命名规范：goal:{kebab-entity}-{kebab-action-past-tense}
 */
export type GoalEventMap = {
  // ============ Goal Events ============
  'goal:created': GoalCreatedEvent;
  'goal:updated': GoalUpdatedEvent;
  'goal:status-changed': GoalStatusChangedEvent;
  'goal:completed': GoalCompletedEvent;
  'goal:archived': GoalArchivedEvent;
  'goal:deleted': GoalDeletedEvent;
  'goal:schedule-time-changed': GoalScheduleTimeChangedEvent;
  'goal:reminder-config-changed': GoalReminderConfigChangedEvent;

  // ============ KeyResult Events ============
  'goal:key-result-added': KeyResultAddedEvent;
  'goal:key-result-updated': KeyResultUpdatedEvent;
  'goal:key-result-deleted': KeyResultDeletedEvent;

  // ============ GoalReview Events ============
  'goal:review-added': ReviewAddedEvent;
};
