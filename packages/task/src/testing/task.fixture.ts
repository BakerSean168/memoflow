/**
 * Task domain test fixtures
 *
 * Provides factory functions for creating task domain objects in tests.
 * Uses the domain's own factory methods to ensure valid objects.
 */

import { IdentityId } from '@memoflow/domain-shared';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import {
  DayOfWeek,
  TaskType,
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
} from '@memoflow/contracts/task';
import { anIdentityId } from '@memoflow/test-utils/fixtures';
import {
  TaskPlanId,
  TaskOccurrenceId,
  TaskTimeConfig,
  RecurrenceRule,
  TaskReminderConfig,
  CompletionRecord,
  ChecklistItemDefinition,
  TaskPlanStatus,
  TaskPlanSchedule,
} from '../server/domain';
import { TaskOccurrence, TaskPlan } from '../server/domain';
import type { TaskPlanState } from '../server/domain';

function titleFor(prefix: string): string {
  return `${prefix} ${Math.random().toString(36).slice(2, 8)}`;
}

/** Residual 1033: anIdentityId dual retired onto @memoflow/test-utils/fixtures sole. */
export { anIdentityId };

export interface OneTimeTaskOverrides {
  identityId?: IdentityId;
  title?: string;
  description?: string;
  importance?: ImportanceLevel;
  startDate?: number;
}

export function aOneTimeTask(overrides: OneTimeTaskOverrides = {}): TaskPlan {
  return TaskPlan.createOneTimeTask({
    identityId: overrides.identityId ?? anIdentityId(),
    title: overrides.title ?? titleFor('Task'),
    description: overrides.description,
    importance: overrides.importance ?? ImportanceLevel.Moderate,
    startDate: overrides.startDate ?? Date.now(),
  });
}

export interface RecurringTaskOverrides {
  identityId?: IdentityId;
  title?: string;
  description?: string;
  importance?: ImportanceLevel;
  timeConfig?: TaskTimeConfig;
  recurrenceRule?: RecurrenceRule;
  reminderConfig?: TaskReminderConfig;
  generateAheadDays?: number;
}

export function aRecurringTask(overrides: RecurringTaskOverrides = {}): TaskPlan {
  return TaskPlan.createRecurringTask({
    identityId: overrides.identityId ?? anIdentityId(),
    title: overrides.title ?? titleFor('Recurring Task'),
    description: overrides.description,
    importance: overrides.importance ?? ImportanceLevel.Moderate,
    timeConfig: overrides.timeConfig ?? anAllDayTimeConfig(),
    recurrenceRule: overrides.recurrenceRule ?? aDailyRecurrenceRule(),
    reminderConfig: overrides.reminderConfig,
    generateAheadDays: overrides.generateAheadDays,
  });
}

export function aTaskPlanState(
  overrides: Partial<TaskPlanState> & {
    taskType?: TaskType;
    timeConfig?: TaskTimeConfig | null;
    recurrenceRule?: RecurrenceRule | null;
  } = {},
): TaskPlanState {
  const id = overrides.id ?? TaskPlanId.generate();
  const now = Date.now();

  return {
    id,
    identityId: overrides.identityId ?? anIdentityId(),
    title: overrides.title ?? titleFor('Task'),
    description: overrides.description ?? null,
    schedule:
      overrides.schedule ??
      TaskPlanSchedule.fromLegacy(
        overrides.taskType ?? (overrides.recurrenceRule ? TaskType.Recurring : TaskType.OneTime),
        overrides.timeConfig ?? anAllDayTimeConfig(),
        overrides.recurrenceRule ?? null,
      ),
    importance: overrides.importance ?? ImportanceLevel.Moderate,
    status: overrides.status ?? TaskPlanStatus.Active,
    outcome: overrides.outcome ?? TaskPlanOutcome.Open,
    completionPolicy: overrides.completionPolicy ?? TaskPlanCompletionPolicy.AllowCorrection,
    closedAt: overrides.closedAt ?? null,
    archivedAt: overrides.archivedAt ?? null,
    abandonedReason: overrides.abandonedReason ?? null,
    goalBinding: overrides.goalBinding ?? null,
    checklist: overrides.checklist ?? [],
    reminderConfig: overrides.reminderConfig ?? null,
    lastGeneratedDate: overrides.lastGeneratedDate ?? null,
    generateAheadDays: overrides.generateAheadDays ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    deletedAt: overrides.deletedAt ?? null,
    version: overrides.version ?? 1,
  };
}

export function aLoadedTaskPlan(overrides: Partial<TaskPlanState> = {}): TaskPlan {
  return TaskPlan.load(aTaskPlanState(overrides));
}

export interface TaskOccurrenceOverrides {
  templateId?: TaskPlanId;
  identityId?: IdentityId;
  instanceDate?: number;
  timeConfig?: TaskTimeConfig;
  importance?: ImportanceLevel;
}

export async function aTaskOccurrence(overrides: TaskOccurrenceOverrides = {}) {
  return TaskOccurrence.create({
    templateId: overrides.templateId ?? TaskPlanId.generate(),
    identityId: overrides.identityId ?? anIdentityId(),
    instanceDate: overrides.instanceDate ?? Date.now(),
    timeConfig: overrides.timeConfig ?? anAllDayTimeConfig(),
    importance: overrides.importance ?? ImportanceLevel.Moderate,
  });
}

export function anAllDayTimeConfig(startDate?: Date): TaskTimeConfig {
  return TaskTimeConfig.createAllDay(startDate ?? new Date());
}

export function aTimePointConfig(timePoint = 540, startDate?: Date): TaskTimeConfig {
  return TaskTimeConfig.createTimePoint(startDate ?? new Date(), timePoint);
}

export function aTimeRangeConfig(start = 540, end = 600, startDate?: Date): TaskTimeConfig {
  return TaskTimeConfig.createTimeRange(startDate ?? new Date(), start, end);
}

export function aDailyRecurrenceRule(interval = 1): RecurrenceRule {
  return RecurrenceRule.createDaily(interval);
}

export function aWeeklyRecurrenceRule(
  daysOfWeek: DayOfWeek[] = [
    DayOfWeek.Monday,
    DayOfWeek.Tuesday,
    DayOfWeek.Wednesday,
    DayOfWeek.Thursday,
    DayOfWeek.Friday,
  ],
  interval = 1,
): RecurrenceRule {
  return RecurrenceRule.createWeekly(daysOfWeek, interval);
}

export function aDisabledReminderConfig(): TaskReminderConfig {
  return TaskReminderConfig.createDefault();
}

export function aRelativeReminder(value = 15, unit = 'Minutes' as const): TaskReminderConfig {
  return TaskReminderConfig.createRelativeReminder(value, unit);
}

export function aCompletionRecord(completedAt?: number): CompletionRecord {
  return CompletionRecord.complete(completedAt);
}

export function aCompletionWithDuration(
  durationMinutes = 30,
  completedAt?: number,
): CompletionRecord {
  return CompletionRecord.completeWithDuration(durationMinutes, completedAt);
}

export function aChecklist(...titles: string[]): ChecklistItemDefinition[] {
  if (titles.length === 0) {
    titles = ['Step 1', 'Step 2', 'Step 3'];
  }
  return ChecklistItemDefinition.fromTitles(titles);
}

export function aTaskPlanId(value?: string): TaskPlanId {
  if (value) return TaskPlanId.of(value);
  return TaskPlanId.generate();
}

export function aTaskOccurrenceId(value?: string): TaskOccurrenceId {
  if (value) return TaskOccurrenceId.of(value);
  return TaskOccurrenceId.generate();
}
