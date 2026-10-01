import { describe, expect, it } from 'vitest';
import {
  TaskOccurrenceStatus,
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  TaskPlanScheduleKind,
  TaskRecurrenceEndKind,
} from '@memoflow/contracts/task';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import type { Ymd } from '@memoflow/contracts/primitives';
import { IdentityId } from '@memoflow/domain-shared';
import { asYmd, createTimeContext } from '@memoflow/time';
import { TaskPlan } from '../aggregates/task-plan';
import { createTaskRecurrenceDateAdapter } from '../aggregates/task-recurrence-date.adapter';
import { TaskPlanId } from '../value-objects/task-plan-id';
import { TaskPlanStatus } from '../value-objects/task-plan-status';
import { TaskPlanOutcomeEvaluator } from '../services/task-plan-outcome-evaluator';
import {
  aDailyRecurrence,
  anAllDayTiming,
  canonicalTaskPlanScheduleForTest,
} from '../../../testing';

const TIME_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const OCCURRENCE_COUNT = 20_000;

function requireExplicitGc(): () => void {
  if (typeof global.gc !== 'function') {
    throw new Error('Task performance experiment requires Node --expose-gc');
  }
  return global.gc;
}

function createPlan(occurrenceCount = OCCURRENCE_COUNT): TaskPlan {
  const now = Date.now();
  const anchor = Date.UTC(2026, 0, 1);
  return TaskPlan.load({
    id: TaskPlanId.generate(),
    identityId: IdentityId.generate(),
    title: 'Nightly performance experiment plan',
    description: null,
    schedule: canonicalTaskPlanScheduleForTest(
      TaskPlanScheduleKind.Recurring,
      anchor,
      anAllDayTiming(),
      {
        ...aDailyRecurrence(),
        end: { kind: TaskRecurrenceEndKind.Count, count: occurrenceCount },
      },
      TIME_CONTEXT,
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
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
  });
}

function createCompletedOccurrences(count = OCCURRENCE_COUNT) {
  return Array.from({ length: count }, (_, index) => ({
    scheduleDate: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10) as Ymd,
    status: TaskOccurrenceStatus.Completed,
    deletedAt: null,
  }));
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe('Task vNext nightly performance experiment', () => {
  it('does not retain excessive heap across repeated outcome evaluation', () => {
    const gc = requireExplicitGc();
    const evaluator = new TaskPlanOutcomeEvaluator();
    const plan = createPlan();
    const occurrences = createCompletedOccurrences();

    // Warm the JIT and lazy module paths before taking the retained-heap baseline.
    for (let index = 0; index < 5; index += 1) {
      expect(evaluator.evaluate(plan, occurrences, TIME_CONTEXT)).toBe(TaskPlanOutcome.Succeeded);
    }
    gc();
    const baseline = process.memoryUsage().heapUsed;

    for (let index = 0; index < 100; index += 1) {
      expect(evaluator.evaluate(plan, occurrences, TIME_CONTEXT)).toBe(TaskPlanOutcome.Succeeded);
    }

    gc();
    const retainedHeapMb = (process.memoryUsage().heapUsed - baseline) / 1024 / 1024;
    expect(retainedHeapMb).toBeLessThan(32);
  });

  it('does not develop a repeated-operation performance cliff', () => {
    const evaluator = new TaskPlanOutcomeEvaluator();
    const plan = createPlan();
    const occurrences = createCompletedOccurrences();
    const samples: number[] = [];

    for (let index = 0; index < 10; index += 1) {
      evaluator.evaluate(plan, occurrences, TIME_CONTEXT);
    }

    for (let sample = 0; sample < 40; sample += 1) {
      const startedAt = performance.now();
      for (let iteration = 0; iteration < 10; iteration += 1) {
        evaluator.evaluate(plan, occurrences, TIME_CONTEXT);
      }
      samples.push((performance.now() - startedAt) / 10);
    }

    const firstHalfAverage = average(samples.slice(0, 20));
    const secondHalfAverage = average(samples.slice(20));
    expect(secondHalfAverage).toBeLessThan(firstHalfAverage * 3);
  });

  it('keeps canonical recurrence expansion stable under repeated load', () => {
    const adapter = createTaskRecurrenceDateAdapter();
    const recurrence = {
      ...aDailyRecurrence(),
      end: { kind: TaskRecurrenceEndKind.Count, count: 1000 },
    };
    const from = Date.UTC(2026, 0, 1);
    const to = Date.UTC(2030, 0, 1);
    const samples: number[] = [];

    for (let sample = 0; sample < 30; sample += 1) {
      const startedAt = performance.now();
      const dates = adapter.between(recurrence, asYmd('2026-01-01'), from, to, TIME_CONTEXT);
      samples.push(performance.now() - startedAt);
      expect(dates).toHaveLength(1000);
    }

    const sorted = [...samples].sort((left, right) => left - right);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    expect(p95).toBeLessThan(Math.max(1, median) * 8);
  });
});
