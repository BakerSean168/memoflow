/**
 * Task Value Objects Export
 */

// RecurrenceRule
export type { RecurrenceRule, RecurrenceRuleDTO, RecurrenceConfigReq } from './recurrence-rule';
export { RecurrenceConfigSchema } from './recurrence-rule';

// TaskReminderConfig
export type { TaskReminderConfig, TaskReminderConfigDTO } from './task-reminder-config';
export { TaskReminderConfigSchema } from './task-reminder-config';

// TaskGoalBinding
export type {
  GoalContributionRule,
  TaskGoalLink,
  TaskGoalLinkDTO,
  TaskGoalBinding,
  TaskGoalBindingDTO,
} from './task-goal-binding';
export {
  GoalContributionRuleSchema,
  TaskGoalLinkSchema,
  TaskGoalBindingSchema,
} from './task-goal-binding';
export { TaskGoalBindingTrigger } from './task-goal-binding-trigger';
export type { TaskGoalBindingTrigger as TaskGoalBindingTriggerValue } from './task-goal-binding-trigger';

// TaskTimeConfig
export type { TaskTimeConfig, TaskTimeConfigDTO, TaskTimeConfigReq } from './task-time-config';
export { TaskTimeConfigSchema } from './task-time-config';

// Task Plan vNext schedule algebra
export {
  TaskYmdSchema,
  TaskHmSchema,
  TaskTimingKind,
  TaskTimingSchema,
  TaskRecurrenceEndKind,
  TaskRecurrenceEndSchema,
  TaskRecurrenceSchema,
  TaskPlanScheduleKind,
  OneTimeTaskPlanScheduleSchema,
  RecurringTaskPlanScheduleSchema,
  TaskPlanScheduleSchema,
} from './task-plan-schedule';
export type {
  TaskTiming,
  TaskRecurrenceEnd,
  TaskRecurrence,
  OneTimeTaskPlanSchedule,
  RecurringTaskPlanSchedule,
  TaskPlanSchedule,
} from './task-plan-schedule';

// Occurrence reality facts
export { TaskOccurrenceResultKind, TaskOccurrenceResultSchema } from './task-occurrence-result';
export type { TaskOccurrenceResult } from './task-occurrence-result';
export { TaskOccurrenceChecklistItemSchema } from './task-occurrence-checklist';
export type { TaskOccurrenceChecklistItem } from './task-occurrence-checklist';
export { ChecklistItemDefinitionSchema } from './checklist-item-definition';

// CompletionRecord
export type { CompletionRecord, CompletionRecordDTO } from './completion-record';

// Enums
export { RecurrenceFrequency } from './recurrence-frequency';
export { DayOfWeek } from './day-of-week';
export { TaskReminderType } from './task-reminder-type';
export { ReminderTimeUnit } from './reminder-time-unit';
export { RecurrenceEndConditionType } from './recurrence-end-condition-type';
export { TaskScheduleMode } from './task-schedule-mode';

export { TaskTemplateStatus } from './task-template-status';
export { TaskPlanOutcome } from './task-plan-outcome';
export type { TaskPlanOutcome as TaskPlanOutcomeValue } from './task-plan-outcome';
export { TaskPlanCompletionPolicy } from './task-plan-completion-policy';
export type { TaskPlanCompletionPolicy as TaskPlanCompletionPolicyValue } from './task-plan-completion-policy';
export { TaskInstanceStatus } from './task-instance-status';
export { TaskTimeType } from './task-time-type';
export { TaskType } from './task-type';
export type {
  ChecklistItemDefinition,
  ChecklistItemDefinitionDTO,
} from './checklist-item-definition';
