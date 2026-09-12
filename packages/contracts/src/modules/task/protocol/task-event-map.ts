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
  TaskPlanScheduleTimeChangedEvent,
  TaskPlanRecurrenceChangedEvent,
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
  'task:instance-completed': TaskOccurrenceCompletedEvent;
  'task:instance-skipped': TaskOccurrenceSkippedEvent;
  'task:instance-deleted': TaskOccurrenceDeletedEvent;
  'task:instance-generated': TaskOccurrencesGeneratedEvent;
  'task:template-paused': TaskPlanPausedEvent;
  'task:template-resumed': TaskPlanResumedEvent;
  'task:template-schedule-time-changed': TaskPlanScheduleTimeChangedEvent;
  'task:template-recurrence-changed': TaskPlanRecurrenceChangedEvent;
  'task:instance-uncompleted': TaskUncompletedEvent;
  'task:plan-outcome-changed': TaskPlanOutcomeChangedEvent;
  'task:rescheduled': TaskRescheduledEvent;
};
