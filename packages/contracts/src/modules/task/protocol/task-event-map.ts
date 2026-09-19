import type {
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskDeletedEvent,
  TaskOccurrenceCompletedEvent,
  TaskOccurrenceSkippedEvent,
  TaskOccurrenceDeletedEvent,
  TaskOccurrencesGeneratedEvent,
  TaskPlanPausedEvent,
  TaskPlanResumedEvent,
  TaskUncompletedEvent,
  TaskRescheduledEvent,
  TaskPlanOutcomeChangedEvent,
} from '../domain/events';

/**
 * Task Module - Event Map
 * 任务模块 - 事件映射
 *
 * 事件命名规范：task:{kebab-action-past-tense}
 */
export type TaskEventMap = {
  'task:created': TaskCreatedEvent;
  'task:updated': TaskUpdatedEvent;
  'task:deleted': TaskDeletedEvent;
  'task:occurrence-completed': TaskOccurrenceCompletedEvent;
  'task:occurrence-skipped': TaskOccurrenceSkippedEvent;
  'task:occurrence-deleted': TaskOccurrenceDeletedEvent;
  'task:occurrence-generated': TaskOccurrencesGeneratedEvent;
  'task:plan-paused': TaskPlanPausedEvent;
  'task:plan-resumed': TaskPlanResumedEvent;
  'task:occurrence-uncompleted': TaskUncompletedEvent;
  'task:plan-outcome-changed': TaskPlanOutcomeChangedEvent;
  'task:rescheduled': TaskRescheduledEvent;
};
