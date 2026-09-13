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
  TaskPlanScheduleKind,
  TaskRecurrenceEndKind,
  TaskTimingKind,
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  type ChecklistItemDefinitionDTO,
  type TaskTiming,
  type TaskRecurrence,
} from '@memoflow/contracts/task';
import { anIdentityId } from '@memoflow/test-utils/fixtures';
import {
  createTimeContext,
  createTimeFacade,
  asHm,
  type TimeContext,
  type UserTimeContextPort,
} from '@memoflow/time';
import { TaskOccurrenceProjectionService } from '../server/application/services/task-occurrence-projection.service';
import {
  TaskPlanId,
  TaskOccurrenceId,
  TaskReminderConfig,
  ChecklistItemDefinition,
  TaskPlanStatus,
  TaskPlanSchedule,
  TaskOccurrenceScheduleSnapshot,
} from '../server/domain';
import { TaskOccurrence, TaskPlan } from '../server/domain';
import type { TaskPlanState } from '../server/domain';

export const TASK_TEST_TIME_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
export const TASK_TEST_USER_TIME_CONTEXT_PORT: UserTimeContextPort = {
  getUserTimeContext: async () => TASK_TEST_TIME_CONTEXT,
};
export const TASK_TEST_OCCURRENCE_PROJECTION = new TaskOccurrenceProjectionService(
  TASK_TEST_USER_TIME_CONTEXT_PORT,
);

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

function hmForTest(minutes: number) {
  return asHm(
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
  );
}

export function canonicalTaskPlanScheduleForTest(
  kind: TaskPlanScheduleKind,
  date: number | Date,
  timing: TaskTiming,
  recurrence: TaskRecurrence | null,
  timeContext: TimeContext = TASK_TEST_TIME_CONTEXT,
): TaskPlanSchedule {
  const time = createTimeFacade({ context: timeContext });
  const startYmd = time.calendar.toYmd(date instanceof Date ? date.getTime() : date);
  if (kind === TaskPlanScheduleKind.OneTime) {
    return TaskPlanSchedule.create({
      kind: TaskPlanScheduleKind.OneTime,
      date: startYmd,
      timing,
    });
  }
  if (!recurrence) throw new Error('Recurring test plan requires recurrence');
  return TaskPlanSchedule.create({
    kind: TaskPlanScheduleKind.Recurring,
    startDate: startYmd,
    timing,
    recurrence,
  });
}

export function canonicalTaskOccurrenceScheduleForTest(
  occurrenceDate: number,
  timing: TaskTiming,
  timeContext: TimeContext = TASK_TEST_TIME_CONTEXT,
): TaskOccurrenceScheduleSnapshot {
  const time = createTimeFacade({ context: timeContext });
  return TaskOccurrenceScheduleSnapshot.create({
    date: time.calendar.toYmd(occurrenceDate),
    timing,
  });
}

export function aOneTimeTask(overrides: OneTimeTaskOverrides = {}): TaskPlan {
  return TaskPlan.create({
    identityId: overrides.identityId ?? anIdentityId(),
    title: overrides.title ?? titleFor('Task'),
    description: overrides.description,
    importance: overrides.importance ?? ImportanceLevel.Moderate,
    schedule: canonicalTaskPlanScheduleForTest(
      TaskPlanScheduleKind.OneTime,
      overrides.startDate ?? Date.now(),
      anAllDayTiming(),
      null,
      TASK_TEST_TIME_CONTEXT,
    ),
  });
}

export interface RecurringTaskOverrides {
  identityId?: IdentityId;
  title?: string;
  description?: string;
  importance?: ImportanceLevel;
  startDate?: number;
  timing?: TaskTiming;
  recurrence?: TaskRecurrence;
  reminderConfig?: TaskReminderConfig;
}

export function aRecurringTask(overrides: RecurringTaskOverrides = {}): TaskPlan {
  return TaskPlan.create({
    identityId: overrides.identityId ?? anIdentityId(),
    title: overrides.title ?? titleFor('Recurring Task'),
    description: overrides.description,
    importance: overrides.importance ?? ImportanceLevel.Moderate,
    schedule: canonicalTaskPlanScheduleForTest(
      TaskPlanScheduleKind.Recurring,
      overrides.startDate ?? Date.now(),
      overrides.timing ?? anAllDayTiming(),
      overrides.recurrence ?? aDailyRecurrence(),
      TASK_TEST_TIME_CONTEXT,
    ),
    reminderConfig: overrides.reminderConfig,
  });
}

export function aTaskPlanState(overrides: Partial<TaskPlanState> = {}): TaskPlanState {
  const id = overrides.id ?? TaskPlanId.generate();
  const now = Date.now();

  return {
    id,
    identityId: overrides.identityId ?? anIdentityId(),
    title: overrides.title ?? titleFor('Task'),
    description: overrides.description ?? null,
    schedule:
      overrides.schedule ??
      canonicalTaskPlanScheduleForTest(
        TaskPlanScheduleKind.OneTime,
        now,
        anAllDayTiming(),
        null,
        TASK_TEST_TIME_CONTEXT,
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
  planId?: TaskPlanId;
  identityId?: IdentityId;
  occurrenceDate?: number;
  timing?: TaskTiming;
  importance?: ImportanceLevel;
  checklistDefinition?: readonly ChecklistItemDefinitionDTO[];
  timeContext?: TimeContext;
}

export async function aTaskOccurrence(overrides: TaskOccurrenceOverrides = {}) {
  const timeContext = overrides.timeContext ?? TASK_TEST_TIME_CONTEXT;
  const occurrenceDate = overrides.occurrenceDate ?? Date.now();
  const timing = overrides.timing ?? anAllDayTiming();
  return TaskOccurrence.create({
    planId: overrides.planId ?? TaskPlanId.generate(),
    identityId: overrides.identityId ?? anIdentityId(),
    scheduleSnapshot: canonicalTaskOccurrenceScheduleForTest(occurrenceDate, timing, timeContext),
    importanceSnapshot: overrides.importance ?? ImportanceLevel.Moderate,
    checklistDefinition: overrides.checklistDefinition,
  });
}

export function anAllDayTiming(): TaskTiming {
  return { kind: TaskTimingKind.AllDay };
}

export function aTimePointTiming(timePoint = 540): TaskTiming {
  return { kind: TaskTimingKind.At, time: hmForTest(timePoint) };
}

export function aTimeRangeTiming(start = 540, end = 600): TaskTiming {
  return { kind: TaskTimingKind.Window, start: hmForTest(start), end: hmForTest(end) };
}

export function aDailyRecurrence(interval = 1): TaskRecurrence {
  return {
    frequency: 'Daily',
    interval,
    byWeekday: [],
    end: { kind: TaskRecurrenceEndKind.Never },
  };
}

export function aWeeklyRecurrence(
  daysOfWeek: DayOfWeek[] = [
    DayOfWeek.Monday,
    DayOfWeek.Tuesday,
    DayOfWeek.Wednesday,
    DayOfWeek.Thursday,
    DayOfWeek.Friday,
  ],
  interval = 1,
): TaskRecurrence {
  return {
    frequency: 'Weekly',
    interval,
    byWeekday: daysOfWeek,
    end: { kind: TaskRecurrenceEndKind.Never },
  };
}

export function aDisabledReminderConfig(): TaskReminderConfig {
  return TaskReminderConfig.createDefault();
}

export function aRelativeReminder(value = 15, unit = 'Minutes' as const): TaskReminderConfig {
  return TaskReminderConfig.createRelativeReminder(value, unit);
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
