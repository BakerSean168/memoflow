import { describe, expect, it } from 'vitest';
import {
  RecurrenceFrequency,
  TaskOccurrenceStatus,
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  TaskType,
  type TaskPlanOutcomeValue,
} from '@memoflow/contracts/task';
import { TaskPlan } from '../aggregates/task-plan';
import { TaskPlanId } from '../value-objects/task-plan-id';
import { TaskPlanStatus } from '../value-objects/task-plan-status';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { IdentityId } from '@memoflow/domain-shared';
import { createTaskRecurrenceDateAdapter } from '../aggregates/task-recurrence-date.adapter';
import { TaskPlanOutcomeEvaluator } from '../services/task-plan-outcome-evaluator';
import { RecurrenceRule, TaskPlanSchedule, TaskTimeConfig } from '../value-objects';

function averageDuration(iterations: number, work: () => void): number {
  for (let i = 0; i < 3; i++) work();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) work();
  return (performance.now() - start) / iterations;
}

describe('Task vNext performance budgets', () => {
  it('evaluates a 20k-occurrence finite plan without reintroducing query-time priority sorting', () => {
    const occurrenceCount = 20_000;
    const evaluator = new TaskPlanOutcomeEvaluator();
    const now = Date.now();
    const template = TaskPlan.load({
      id: TaskPlanId.generate(),
      identityId: IdentityId.generate(),
      title: 'Performance benchmark template',
      description: null,
      schedule: TaskPlanSchedule.fromLegacy(
        TaskType.Recurring,
        TaskTimeConfig.createAllDay(now),
        RecurrenceRule.create({
          frequency: 'Daily',
          interval: 1,
          daysOfWeek: [],
          endDate: null,
          occurrences: occurrenceCount,
        }),
      ),
      importance: ImportanceLevel.Moderate,
      status: TaskPlanStatus.Active,
      outcome: TaskPlanOutcome.Open,
      completionPolicy: TaskPlanCompletionPolicy.AllowCorrection,
      closedAt: null,
      archivedAt: null,
      abandonedReason: null,
      goalBinding: null,
      checklist: [],
      reminderConfig: null,
      lastGeneratedDate: null,
      generateAheadDays: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
    });
    const occurrences = Array.from({ length: occurrenceCount }, () => ({
      status: TaskOccurrenceStatus.Completed,
      deletedAt: null,
    }));

    let result: TaskPlanOutcomeValue = TaskPlanOutcome.Open;
    const avgMs = averageDuration(40, () => {
      result = evaluator.evaluate(template, occurrences);
    });

    expect(result).toBe(TaskPlanOutcome.Succeeded);
    expect(avgMs).toBeLessThan(50);
  });

  it('expands 1000 daily candidate dates through the canonical recurrence adapter', () => {
    const adapter = createTaskRecurrenceDateAdapter();
    const anchor = new Date(2026, 0, 1, 0, 0, 0, 0);
    const timeConfig = TaskTimeConfig.createAllDay(anchor);
    const rule = RecurrenceRule.create({
      frequency: RecurrenceFrequency.Daily,
      interval: 1,
      daysOfWeek: [],
      endDate: null,
      occurrences: 1000,
    });
    const from = anchor.getTime();
    const to = new Date(2030, 0, 1, 0, 0, 0, 0).getTime();

    let dates: number[] = [];
    const avgMs = averageDuration(5, () => {
      dates = adapter.between(rule, timeConfig, from, to);
    });

    expect(dates).toHaveLength(1000);
    expect(avgMs).toBeLessThan(500);
  });
});
