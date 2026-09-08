import { describe, expect, it } from 'vitest';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import {
  RecurrenceFrequency,
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  TaskPlanStatus,
  TaskType,
} from '@memoflow/contracts/task';
import { TaskPlan } from '../aggregates/task-plan';
import { TaskOccurrence } from '../aggregates/task-occurrence';
import { TaskPlanOutcomeEvaluator } from './task-plan-outcome-evaluator';
import { RecurrenceRule, TaskTimeConfig } from '../value-objects';
import { aTaskPlanState } from '../../../testing/task.fixture';

function fifteenDayPlan(policy = TaskPlanCompletionPolicy.AllowCorrection) {
  const recurrenceRule = RecurrenceRule.create({
    frequency: RecurrenceFrequency.Daily,
    interval: 1,
    daysOfWeek: [],
    endDate: null,
    occurrences: 15,
  });
  const timeConfig = TaskTimeConfig.createAllDay(new Date());
  const template = TaskPlan.load(
    aTaskPlanState({ taskType: TaskType.Recurring, recurrenceRule, timeConfig, completionPolicy: policy }),
  );
  const base = Date.now() - 15 * 86_400_000;
  const instances = Array.from({ length: 15 }, (_, index) =>
    TaskOccurrence.create({
      templateId: template.id,
      identityId: template.identityId,
      instanceDate: base + index * 86_400_000,
      timeConfig,
      importance: ImportanceLevel.Moderate,
    }),
  );
  return { template, instances };
}

describe('TaskPlanOutcomeEvaluator (TASK-2202)', () => {
  const evaluator = new TaskPlanOutcomeEvaluator();

  it('15/15 completed => Succeeded and closes the finite plan', () => {
    const { template, instances } = fifteenDayPlan();
    instances.forEach((instance) => instance.complete());
    const outcome = evaluator.evaluate(template, instances);
    expect(outcome).toBe(TaskPlanOutcome.Succeeded);
    template.applyPlanOutcome(outcome, { triggeringTaskOccurrenceId: instances[14].id });
    expect(template.status).toBe(TaskPlanStatus.Closed);
    expect(template.outcome).toBe(TaskPlanOutcome.Succeeded);
  });

  it('unresolved finite scope remains Open rather than guessing Failed', () => {
    const { template, instances } = fifteenDayPlan();
    instances.slice(0, 14).forEach((instance) => instance.complete());
    expect(evaluator.evaluate(template, instances)).toBe(TaskPlanOutcome.Open);
  });

  it('Missed remains Open under correction policy', () => {
    const { template, instances } = fifteenDayPlan(TaskPlanCompletionPolicy.AllowCorrection);
    instances.slice(0, 14).forEach((instance) => instance.complete());
    instances[14].markMissed();
    expect(evaluator.evaluate(template, instances)).toBe(TaskPlanOutcome.Open);
  });

  it('Missed makes strict no-backfill success impossible => Failed', () => {
    const { template, instances } = fifteenDayPlan(TaskPlanCompletionPolicy.StrictNoBackfill);
    instances[6].markMissed('day 7 was required');
    expect(evaluator.evaluate(template, instances)).toBe(TaskPlanOutcome.Failed);
  });

  it('Skipped waives that occurrence from required scope', () => {
    const { template, instances } = fifteenDayPlan();
    instances.slice(0, 14).forEach((instance) => instance.complete());
    instances[14].skip('not applicable');
    expect(evaluator.evaluate(template, instances)).toBe(TaskPlanOutcome.Succeeded);
  });

  it('correction re-evaluates Failed -> Succeeded and uncomplete re-opens to Open', () => {
    const { template, instances } = fifteenDayPlan(TaskPlanCompletionPolicy.StrictNoBackfill);
    instances.forEach((instance) => instance.complete());
    instances[14].uncomplete();
    instances[14].markMissed();
    template.applyPlanOutcome(evaluator.evaluate(template, instances), { triggeringTaskOccurrenceId: instances[14].id });
    expect(template.outcome).toBe(TaskPlanOutcome.Failed);

    instances[14].complete();
    template.applyPlanOutcome(evaluator.evaluate(template, instances), { triggeringTaskOccurrenceId: instances[14].id });
    expect(template.outcome).toBe(TaskPlanOutcome.Succeeded);
    expect(template.status).toBe(TaskPlanStatus.Closed);

    instances[14].uncomplete();
    template.applyPlanOutcome(evaluator.evaluate(template, instances), { triggeringTaskOccurrenceId: instances[14].id });
    expect(template.outcome).toBe(TaskPlanOutcome.Open);
    expect(template.status).toBe(TaskPlanStatus.Active);
  });

  it('explicit abandon is authoritative and evaluator never overwrites it', () => {
    const { template, instances } = fifteenDayPlan();
    template.abandon('user stopped the plan');
    expect(template.outcome).toBe(TaskPlanOutcome.Abandoned);
    expect(template.status).toBe(TaskPlanStatus.Closed);
    expect(evaluator.evaluate(template, instances)).toBe(TaskPlanOutcome.Abandoned);
  });

  it('historical Archived/Deleted lifecycle values are rejected after destructive reset', () => {
    expect(() => TaskPlan.load(aTaskPlanState({ status: 'Archived' as any }))).toThrow();
    expect(() => TaskPlan.load(aTaskPlanState({ status: 'Deleted' as any }))).toThrow();
  });
});
