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
import {
  nextRecurrenceDate,
  recurrenceDatesBetween,
} from '../aggregates/task-recurrence-date.adapter';

export interface TaskPlanOccurrenceFact {
  scheduleDate: Ymd;
  status: (typeof TaskOccurrenceStatus)[keyof typeof TaskOccurrenceStatus];
  deletedAt: number | null;
}

/** Deterministic Task-owned evaluator. Goal and recurrence engines do not decide Task outcome. */
export class TaskPlanOutcomeEvaluator {
  evaluate(
    template: TaskPlan,
    instances: readonly TaskPlanOccurrenceFact[],
    timeContext: TimeContext,
  ): TaskPlanOutcomeValue {
    if (template.outcome === TaskPlanOutcome.Abandoned) return TaskPlanOutcome.Abandoned;
    if (!this.isFinite(template)) return TaskPlanOutcome.Open;

    const relevant = instances.filter((instance) => instance.deletedAt === null);
    if (relevant.length === 0) return TaskPlanOutcome.Open;

    if (
      template.completionPolicy === TaskPlanCompletionPolicy.StrictNoBackfill &&
      relevant.some((instance) => instance.status === TaskOccurrenceStatus.Missed)
    ) {
      return TaskPlanOutcome.Failed;
    }

    if (!this.isScopeFullyKnown(template, relevant, timeContext)) return TaskPlanOutcome.Open;

    // Skipped is a waiver: it is excluded from required completion scope.
    const required = relevant.filter(
      (instance) => instance.status !== TaskOccurrenceStatus.Skipped,
    );
    if (required.some((instance) => instance.status === TaskOccurrenceStatus.Missed)) {
      return TaskPlanOutcome.Open;
    }
    if (required.every((instance) => instance.status === TaskOccurrenceStatus.Completed)) {
      return TaskPlanOutcome.Succeeded;
    }
    return TaskPlanOutcome.Open;
  }

  private isFinite(template: TaskPlan): boolean {
    if (!template.schedule.isRecurring) return true;
    const recurrence = template.schedule.recurrence;
    return recurrence != null && recurrence.end.kind !== TaskRecurrenceEndKind.Never;
  }

  private isScopeFullyKnown(
    template: TaskPlan,
    instances: readonly TaskPlanOccurrenceFact[],
    timeContext: TimeContext,
  ): boolean {
    if (!template.schedule.isRecurring) return instances.length >= 1;
    const recurrence = template.schedule.recurrence;
    if (!recurrence) return false;

    const actualDates = new Set(instances.map((instance) => String(instance.scheduleDate)));
    const time = createTimeFacade({ context: timeContext });
    const startYmd = time.codec.parseYmd(template.schedule.calendarDate, { onInvalid: 'throw' });
    if (!startYmd) return false;

    const rule = template.schedule.toLegacyRecurrenceRule(timeContext);
    if (!rule) return false;
    const timeConfig = template.schedule.toLegacyTimeConfig(timeContext);
    const startAt = Number(time.codec.startOfYmd(startYmd));

    let expectedDates: Set<string>;
    if (recurrence.end.kind === TaskRecurrenceEndKind.Count) {
      expectedDates = new Set<string>();
      let cursor = startAt - 1;
      for (let index = 0; index < recurrence.end.count; index += 1) {
        const next = nextRecurrenceDate(rule, timeConfig, cursor, timeContext);
        if (next == null) return false;
        expectedDates.add(String(time.calendar.toYmd(next)));
        cursor = next;
      }
    } else if (recurrence.end.kind === TaskRecurrenceEndKind.Until) {
      const endYmd = time.codec.parseYmd(recurrence.end.date, { onInvalid: 'throw' });
      if (!endYmd) return false;
      expectedDates = new Set(
        recurrenceDatesBetween(
          rule,
          timeConfig,
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
