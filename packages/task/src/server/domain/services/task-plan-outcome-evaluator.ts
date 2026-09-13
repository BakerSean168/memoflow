import {
  TaskOccurrenceStatus,
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  TaskRecurrenceEndKind,
  type TaskPlanOutcomeValue,
} from '@memoflow/contracts/task';
import type { Ymd } from '@memoflow/contracts/primitives';
import type { TaskPlan } from '../aggregates/task-plan';
import { createTimeFacade, type TimeContext } from '@memoflow/time';
import { nextRecurrenceDate, recurrenceDatesBetween } from '../aggregates/task-recurrence-date.adapter';

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

    const relevant = occurrences.filter((occurrence) => occurrence.deletedAt === null);
    if (relevant.length === 0) return TaskPlanOutcome.Open;

    if (
      plan.completionPolicy === TaskPlanCompletionPolicy.StrictNoBackfill &&
      relevant.some((occurrence) => occurrence.status === TaskOccurrenceStatus.Missed)
    ) {
      return TaskPlanOutcome.Failed;
    }

    if (!this.isScopeFullyKnown(plan, relevant, timeContext)) return TaskPlanOutcome.Open;

    // Skipped is a waiver: it is excluded from required completion scope.
    const required = relevant.filter(
      (occurrence) => occurrence.status !== TaskOccurrenceStatus.Skipped,
    );
    if (required.some((occurrence) => occurrence.status === TaskOccurrenceStatus.Missed)) {
      return TaskPlanOutcome.Open;
    }
    if (required.every((occurrence) => occurrence.status === TaskOccurrenceStatus.Completed)) {
      return TaskPlanOutcome.Succeeded;
    }
    return TaskPlanOutcome.Open;
  }

  private isFinite(plan: TaskPlan): boolean {
    if (!plan.schedule.isRecurring) return true;
    const recurrence = plan.schedule.recurrence;
    return recurrence != null && recurrence.end.kind !== TaskRecurrenceEndKind.Never;
  }

  private isScopeFullyKnown(
    plan: TaskPlan,
    occurrences: readonly TaskPlanOccurrenceFact[],
    timeContext: TimeContext,
  ): boolean {
    if (!plan.schedule.isRecurring) return occurrences.length >= 1;
    const recurrence = plan.schedule.recurrence;
    if (!recurrence) return false;

    const actualDates = new Set(occurrences.map((occurrence) => String(occurrence.scheduleDate)));
    const time = createTimeFacade({ context: timeContext });
    const startYmd = time.codec.parseYmd(plan.schedule.calendarDate, { onInvalid: 'throw' });
    if (!startYmd) return false;

    const startAt = Number(time.codec.startOfYmd(startYmd));

    let expectedDates: Set<string>;
    if (recurrence.end.kind === TaskRecurrenceEndKind.Count) {
      expectedDates = new Set<string>();
      let cursor = startAt - 1;
      for (let index = 0; index < recurrence.end.count; index += 1) {
        const next = nextRecurrenceDate(
          recurrence,
          plan.schedule.calendarDate,
          cursor,
          timeContext,
        );
        if (next == null) return false;
        expectedDates.add(String(time.calendar.toYmd(next)));
        cursor = next;
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
