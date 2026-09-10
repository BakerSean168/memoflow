import {
  TaskOccurrenceStatus,
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  TaskRecurrenceEndKind,
  type TaskPlanOutcomeValue,
} from '@memoflow/contracts/task';
import type { TaskPlan } from '../aggregates/task-plan';
import { createTimeFacade, type TimeContext } from '@memoflow/time';

export interface TaskPlanOccurrenceFact {
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

    if (!this.isScopeFullyKnown(template, relevant.length, timeContext)) return TaskPlanOutcome.Open;

    // Skipped is a waiver: it is excluded from required completion scope.
    const required = relevant.filter((instance) => instance.status !== TaskOccurrenceStatus.Skipped);
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
    instanceCount: number,
    timeContext: TimeContext,
  ): boolean {
    if (!template.schedule.isRecurring) return instanceCount >= 1;
    const recurrence = template.schedule.recurrence;
    if (!recurrence) return false;
    if (recurrence.end.kind === TaskRecurrenceEndKind.Count) {
      return instanceCount >= recurrence.end.count;
    }
    if (recurrence.end.kind !== TaskRecurrenceEndKind.Until || template.lastGeneratedDate === null) {
      return false;
    }
    const generatedThrough = String(
      createTimeFacade({ context: timeContext }).calendar.toYmd(template.lastGeneratedDate),
    );
    return generatedThrough >= String(recurrence.end.date);
  }
}
