import {
  TaskOccurrenceStatus,
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  TaskRecurrenceEndKind,
  RecurrenceFrequency,
  type TaskPlanOutcomeValue,
} from '@memoflow/contracts/task';
import type { Ymd } from '@memoflow/contracts/primitives';
import type { TaskPlan } from '../aggregates/task-plan';
import { addYmdDays, createTimeFacade, type TimeContext } from '@memoflow/time';
import { recurrenceDatesBetween } from '../aggregates/task-recurrence-date.adapter';

export interface TaskPlanOccurrenceFact {
  scheduleDate: Ymd;
  status: (typeof TaskOccurrenceStatus)[keyof typeof TaskOccurrenceStatus];
  deletedAt: number | null;
}

/** Deterministic Task-owned evaluator. Goal and recurrence engines do not decide Task outcome. */
export class TaskPlanOutcomeEvaluator {
  evaluate(
    plan: TaskPlan,
    occurrences: readonly TaskPlanOccurrenceFact[],
    timeContext: TimeContext,
  ): TaskPlanOutcomeValue {
    if (plan.outcome === TaskPlanOutcome.Abandoned) return TaskPlanOutcome.Abandoned;
    if (!this.isFinite(plan)) return TaskPlanOutcome.Open;

    const actualDates = new Set<string>();
    let hasDeletedOccurrence = false;
    for (const occurrence of occurrences) {
      if (occurrence.deletedAt !== null) {
        hasDeletedOccurrence = true;
      } else if (plan.schedule.isRecurring) {
        actualDates.add(occurrence.scheduleDate);
      }
    }
    const relevant = hasDeletedOccurrence
      ? occurrences.filter((occurrence) => occurrence.deletedAt === null)
      : occurrences;
    if (relevant.length === 0) return TaskPlanOutcome.Open;

    if (
      plan.completionPolicy === TaskPlanCompletionPolicy.StrictNoBackfill &&
      relevant.some((occurrence) => occurrence.status === TaskOccurrenceStatus.Missed)
    ) {
      return TaskPlanOutcome.Failed;
    }

    if (!this.isScopeFullyKnown(plan, relevant, actualDates, timeContext)) {
      return TaskPlanOutcome.Open;
    }

    // Skipped is a waiver: it is excluded from required completion scope.
    let allRequiredCompleted = true;
    for (const occurrence of relevant) {
      if (occurrence.status === TaskOccurrenceStatus.Skipped) continue;
      if (occurrence.status === TaskOccurrenceStatus.Missed) return TaskPlanOutcome.Open;
      if (occurrence.status !== TaskOccurrenceStatus.Completed) allRequiredCompleted = false;
    }
    return allRequiredCompleted ? TaskPlanOutcome.Succeeded : TaskPlanOutcome.Open;
  }

  private isFinite(plan: TaskPlan): boolean {
    if (!plan.schedule.isRecurring) return true;
    const recurrence = plan.schedule.recurrence;
    return recurrence != null && recurrence.end.kind !== TaskRecurrenceEndKind.Never;
  }

  private isScopeFullyKnown(
    plan: TaskPlan,
    occurrences: readonly TaskPlanOccurrenceFact[],
    actualDates: ReadonlySet<string>,
    timeContext: TimeContext,
  ): boolean {
    if (!plan.schedule.isRecurring) return occurrences.length >= 1;
    const recurrence = plan.schedule.recurrence;
    if (!recurrence) return false;

    const time = createTimeFacade({ context: timeContext });
    const startYmd = time.codec.parseYmd(plan.schedule.calendarDate, { onInvalid: 'throw' });
    if (!startYmd) return false;

    const startAt = Number(time.codec.startOfYmd(startYmd));

    let expectedDates: Set<string>;
    if (recurrence.end.kind === TaskRecurrenceEndKind.Count) {
      if (actualDates.size < recurrence.end.count) return false;
      if (recurrence.frequency === RecurrenceFrequency.Daily) {
        if (recurrence.interval === 1) {
          const lastExpectedYmd = addYmdDays(startYmd, recurrence.end.count - 1);
          let inRangeCount = 0;
          for (const date of actualDates) {
            if (date >= startYmd && date <= lastExpectedYmd) inRangeCount += 1;
          }
          return inRangeCount === recurrence.end.count;
        }

        let expectedYmd = startYmd;
        for (let index = 0; index < recurrence.end.count; index += 1) {
          if (!actualDates.has(expectedYmd)) return false;
          expectedYmd = addYmdDays(expectedYmd, recurrence.interval);
        }
        return true;
      } else {
        const maxActualYmd = [...actualDates].reduce((max, date) => (date > max ? date : max));
        const maxActualDate = time.codec.parseYmd(maxActualYmd);
        if (!maxActualDate) return false;
        const generatedDates = recurrenceDatesBetween(
          recurrence,
          plan.schedule.calendarDate,
          startAt,
          Number(time.calendar.endOfDay(time.codec.startOfYmd(maxActualDate))),
          timeContext,
        ).map((date) => String(time.calendar.toYmd(date)));
        const generatedDateSet = new Set(generatedDates);
        if (
          generatedDates.length !== recurrence.end.count ||
          generatedDateSet.size !== recurrence.end.count
        ) {
          return false;
        }
        expectedDates = generatedDateSet;
      }
    } else if (recurrence.end.kind === TaskRecurrenceEndKind.Until) {
      const endYmd = time.codec.parseYmd(recurrence.end.date, { onInvalid: 'throw' });
      if (!endYmd) return false;
      expectedDates = new Set(
        recurrenceDatesBetween(
          recurrence,
          plan.schedule.calendarDate,
          startAt,
          time.calendar.endOfDay(time.codec.startOfYmd(endYmd)),
          timeContext,
        ).map((date) => String(time.calendar.toYmd(date))),
      );
    } else {
      return false;
    }

    return expectedDates.size > 0 && [...expectedDates].every((date) => actualDates.has(date));
  }
}
