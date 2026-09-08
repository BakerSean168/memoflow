import {
  TaskOccurrenceStatus,
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  TaskType,
  type TaskPlanOutcomeValue,
} from '@memoflow/contracts/task';
import type { TaskPlan } from '../aggregates/task-plan';

export interface TaskPlanOccurrenceFact {
  status: (typeof TaskOccurrenceStatus)[keyof typeof TaskOccurrenceStatus];
  deletedAt: number | null;
}

/** Deterministic Task-owned evaluator. Goal and recurrence engines do not decide Task outcome. */
export class TaskPlanOutcomeEvaluator {
  evaluate(template: TaskPlan, instances: readonly TaskPlanOccurrenceFact[]): TaskPlanOutcomeValue {
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

    if (!this.isScopeFullyKnown(template, relevant.length)) return TaskPlanOutcome.Open;

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
    return template.taskType === TaskType.OneTime || Boolean(template.recurrenceRule?.hasEndCondition);
  }

  private isScopeFullyKnown(template: TaskPlan, instanceCount: number): boolean {
    if (template.taskType === TaskType.OneTime) return instanceCount >= 1;
    const rule = template.recurrenceRule;
    if (!rule) return false;
    if (rule.occurrences !== null) return instanceCount >= rule.occurrences;
    return rule.endDate !== null && template.lastGeneratedDate !== null && template.lastGeneratedDate >= rule.endDate;
  }
}
