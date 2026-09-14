import { describe, expect, it } from 'vitest';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import {
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  TaskPlanStatus,
  TaskPlanScheduleKind,
  TaskOccurrenceStatus,
  TaskRecurrenceEndKind,
  RecurrenceFrequency,
  TaskTimingKind,
} from '@memoflow/contracts/task';
import { TaskPlan } from '../aggregates/task-plan';
import { TaskOccurrence } from '../aggregates/task-occurrence';
import { TaskPlanOutcomeEvaluator } from './task-plan-outcome-evaluator';
import { TaskOccurrenceScheduleSnapshot, TaskPlanSchedule } from '../value-objects';
import {
  aTaskPlanState,
  aDailyRecurrence,
  anAllDayTiming,
  canonicalTaskOccurrenceScheduleForTest,
  canonicalTaskPlanScheduleForTest,
  TASK_TEST_TIME_CONTEXT,
} from '../../../testing/task.fixture';
import { asYmd, createTimeContext } from '@memoflow/time';

function fifteenDayPlan(policy = TaskPlanCompletionPolicy.AllowCorrection) {
  const recurrence = {
    ...aDailyRecurrence(),
    end: { kind: TaskRecurrenceEndKind.Count, count: 15 },
  } as const;
  const base = Date.parse('2026-03-01T00:00:00.000Z');
  const plan = TaskPlan.load(
    aTaskPlanState({
      schedule: canonicalTaskPlanScheduleForTest(
        TaskPlanScheduleKind.Recurring,
        base,
        anAllDayTiming(),
        recurrence,
      ),
      completionPolicy: policy,
    }),
  );
  const occurrences = Array.from({ length: 15 }, (_, index) =>
    TaskOccurrence.create({
      planId: plan.id,
      identityId: plan.identityId,
      scheduleSnapshot: canonicalTaskOccurrenceScheduleForTest(
        base + index * 86_400_000,
        anAllDayTiming(),
        TASK_TEST_TIME_CONTEXT,
      ),
      importanceSnapshot: ImportanceLevel.Moderate,
    }),
  );
  return { plan, occurrences };
}

function countPlan(count = 3, interval = 1) {
  return TaskPlan.load(
    aTaskPlanState({
      schedule: TaskPlanSchedule.create({
        kind: TaskPlanScheduleKind.Recurring,
        startDate: asYmd('2026-03-01'),
        timing: { kind: TaskTimingKind.AllDay },
        recurrence: {
          frequency: RecurrenceFrequency.Daily,
          interval,
          byWeekday: [],
          end: { kind: TaskRecurrenceEndKind.Count, count },
        },
      }),
    }),
  );
}

function completedFact(date: string, deletedAt: number | null = null) {
  return {
    scheduleDate: asYmd(date),
    status: TaskOccurrenceStatus.Completed,
    deletedAt,
  };
}

describe('TaskPlanOutcomeEvaluator (TASK-2202)', () => {
  const evaluator = new TaskPlanOutcomeEvaluator();

  it('15/15 completed => Succeeded and closes the finite plan', () => {
    const { plan, occurrences } = fifteenDayPlan();
    occurrences.forEach((occurrence) => occurrence.complete());
    const outcome = evaluator.evaluate(plan, occurrences, TASK_TEST_TIME_CONTEXT);
    expect(outcome).toBe(TaskPlanOutcome.Succeeded);
    plan.applyPlanOutcome(outcome, { triggeringTaskOccurrenceId: occurrences[14].id });
    expect(plan.status).toBe(TaskPlanStatus.Closed);
    expect(plan.outcome).toBe(TaskPlanOutcome.Succeeded);
  });

  it('unresolved finite scope remains Open rather than guessing Failed', () => {
    const { plan, occurrences } = fifteenDayPlan();
    occurrences.slice(0, 14).forEach((occurrence) => occurrence.complete());
    expect(evaluator.evaluate(plan, occurrences, TASK_TEST_TIME_CONTEXT)).toBe(
      TaskPlanOutcome.Open,
    );
  });

  it('Missed remains Open under correction policy', () => {
    const { plan, occurrences } = fifteenDayPlan(TaskPlanCompletionPolicy.AllowCorrection);
    occurrences.slice(0, 14).forEach((occurrence) => occurrence.complete());
    occurrences[14].markMissed();
    expect(evaluator.evaluate(plan, occurrences, TASK_TEST_TIME_CONTEXT)).toBe(
      TaskPlanOutcome.Open,
    );
  });

  it('Missed makes strict no-backfill success impossible => Failed', () => {
    const { plan, occurrences } = fifteenDayPlan(TaskPlanCompletionPolicy.StrictNoBackfill);
    occurrences[6].markMissed('day 7 was required');
    expect(evaluator.evaluate(plan, occurrences, TASK_TEST_TIME_CONTEXT)).toBe(
      TaskPlanOutcome.Failed,
    );
  });

  it('Skipped waives that occurrence from required scope', () => {
    const { plan, occurrences } = fifteenDayPlan();
    occurrences.slice(0, 14).forEach((occurrence) => occurrence.complete());
    occurrences[14].skip('not applicable');
    expect(evaluator.evaluate(plan, occurrences, TASK_TEST_TIME_CONTEXT)).toBe(
      TaskPlanOutcome.Succeeded,
    );
  });

  it('correction re-evaluates Failed -> Succeeded and uncomplete re-opens to Open', () => {
    const { plan, occurrences } = fifteenDayPlan(TaskPlanCompletionPolicy.StrictNoBackfill);
    occurrences.forEach((occurrence) => occurrence.complete());
    occurrences[14].uncomplete();
    occurrences[14].markMissed();
    plan.applyPlanOutcome(evaluator.evaluate(plan, occurrences, TASK_TEST_TIME_CONTEXT), {
      triggeringTaskOccurrenceId: occurrences[14].id,
    });
    expect(plan.outcome).toBe(TaskPlanOutcome.Failed);

    occurrences[14].complete();
    plan.applyPlanOutcome(evaluator.evaluate(plan, occurrences, TASK_TEST_TIME_CONTEXT), {
      triggeringTaskOccurrenceId: occurrences[14].id,
    });
    expect(plan.outcome).toBe(TaskPlanOutcome.Succeeded);
    expect(plan.status).toBe(TaskPlanStatus.Closed);

    occurrences[14].uncomplete();
    plan.applyPlanOutcome(evaluator.evaluate(plan, occurrences, TASK_TEST_TIME_CONTEXT), {
      triggeringTaskOccurrenceId: occurrences[14].id,
    });
    expect(plan.outcome).toBe(TaskPlanOutcome.Open);
    expect(plan.status).toBe(TaskPlanStatus.Active);
  });

  it('explicit abandon is authoritative and evaluator never overwrites it', () => {
    const { plan, occurrences } = fifteenDayPlan();
    plan.abandon('user stopped the plan');
    expect(plan.outcome).toBe(TaskPlanOutcome.Abandoned);
    expect(plan.status).toBe(TaskPlanStatus.Closed);
    expect(evaluator.evaluate(plan, occurrences, TASK_TEST_TIME_CONTEXT)).toBe(
      TaskPlanOutcome.Abandoned,
    );
  });

  it('requires the expected Count dates rather than any equally-sized occurrence set', () => {
    const schedule = TaskPlanSchedule.create({
      kind: TaskPlanScheduleKind.Recurring,
      startDate: asYmd('2026-03-01'),
      timing: { kind: TaskTimingKind.AllDay },
      recurrence: {
        frequency: RecurrenceFrequency.Daily,
        interval: 1,
        byWeekday: [],
        end: { kind: TaskRecurrenceEndKind.Count, count: 3 },
      },
    });
    const plan = TaskPlan.load(aTaskPlanState({ schedule }));
    const makeCompleted = (date: string) => {
      const occurrence = TaskOccurrence.create({
        planId: plan.id,
        identityId: plan.identityId,
        scheduleSnapshot: TaskOccurrenceScheduleSnapshot.create({
          date: asYmd(date),
          timing: { kind: TaskTimingKind.AllDay },
        }),
        importanceSnapshot: ImportanceLevel.Moderate,
      });
      occurrence.complete();
      return occurrence;
    };

    expect(
      evaluator.evaluate(
        plan,
        ['2026-03-01', '2026-03-02', '2026-03-04'].map(makeCompleted),
        TASK_TEST_TIME_CONTEXT,
      ),
    ).toBe(TaskPlanOutcome.Open);
    expect(
      evaluator.evaluate(
        plan,
        ['2026-03-01', '2026-03-02', '2026-03-03'].map(makeCompleted),
        TASK_TEST_TIME_CONTEXT,
      ),
    ).toBe(TaskPlanOutcome.Succeeded);
  });

  it('keeps Count Open when a canonical date is missing behind a later extra fact', () => {
    const plan = countPlan();

    expect(
      evaluator.evaluate(
        plan,
        [completedFact('2026-03-01'), completedFact('2026-03-02'), completedFact('2026-03-04')],
        TASK_TEST_TIME_CONTEXT,
      ),
    ).toBe(TaskPlanOutcome.Open);
    expect(
      evaluator.evaluate(
        plan,
        [
          completedFact('2026-03-01'),
          completedFact('2026-03-02'),
          completedFact('2026-03-05'),
        ],
        TASK_TEST_TIME_CONTEXT,
      ),
    ).toBe(TaskPlanOutcome.Open);
  });

  it('allows a complete Count scope to succeed with a later extra fact', () => {
    const plan = countPlan();

    expect(
      evaluator.evaluate(
        plan,
        [
          completedFact('2026-03-01'),
          completedFact('2026-03-02'),
          completedFact('2026-03-03'),
          completedFact('2026-03-04'),
        ],
        TASK_TEST_TIME_CONTEXT,
      ),
    ).toBe(TaskPlanOutcome.Succeeded);
  });

  it('ignores a deleted later Count fact when determining the recurrence bound', () => {
    const plan = countPlan();

    expect(
      evaluator.evaluate(
        plan,
        [
          completedFact('2026-03-01'),
          completedFact('2026-03-02'),
          completedFact('2026-03-03'),
          completedFact('2026-03-04', 1),
        ],
        TASK_TEST_TIME_CONTEXT,
      ),
    ).toBe(TaskPlanOutcome.Succeeded);
  });

  it('uses Daily Count interval days as the canonical date scope', () => {
    const plan = countPlan(3, 2);

    expect(
      evaluator.evaluate(
        plan,
        [completedFact('2026-03-01'), completedFact('2026-03-03'), completedFact('2026-03-05')],
        TASK_TEST_TIME_CONTEXT,
      ),
    ).toBe(TaskPlanOutcome.Succeeded);
    expect(
      evaluator.evaluate(
        plan,
        [completedFact('2026-03-01'), completedFact('2026-03-03'), completedFact('2026-03-06')],
        TASK_TEST_TIME_CONTEXT,
      ),
    ).toBe(TaskPlanOutcome.Open);
  });

  it('requires every expected Until recurrence date instead of trusting a generation cursor', () => {
    const timeContext = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });
    const schedule = TaskPlanSchedule.create({
      kind: TaskPlanScheduleKind.Recurring,
      startDate: asYmd('2026-03-01'),
      timing: { kind: TaskTimingKind.AllDay },
      recurrence: {
        frequency: RecurrenceFrequency.Daily,
        interval: 1,
        byWeekday: [],
        end: { kind: TaskRecurrenceEndKind.Until, date: asYmd('2026-03-09') },
      },
    });
    const plan = TaskPlan.load(aTaskPlanState({ schedule }));
    const occurrences = Array.from({ length: 9 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0');
      const occurrence = TaskOccurrence.create({
        planId: plan.id,
        identityId: plan.identityId,
        scheduleSnapshot: TaskOccurrenceScheduleSnapshot.create({
          date: asYmd(`2026-03-${day}`),
          timing: { kind: TaskTimingKind.AllDay },
        }),
        importanceSnapshot: ImportanceLevel.Moderate,
      });
      occurrence.complete();
      return occurrence;
    });

    expect(evaluator.evaluate(plan, occurrences.slice(0, 8), timeContext)).toBe(
      TaskPlanOutcome.Open,
    );
    expect(evaluator.evaluate(plan, occurrences, timeContext)).toBe(TaskPlanOutcome.Succeeded);
  });

  it('stays Open when an Until scope contains a materialization hole', () => {
    const schedule = TaskPlanSchedule.create({
      kind: TaskPlanScheduleKind.Recurring,
      startDate: asYmd('2026-03-01'),
      timing: { kind: TaskTimingKind.AllDay },
      recurrence: {
        frequency: RecurrenceFrequency.Daily,
        interval: 1,
        byWeekday: [],
        end: { kind: TaskRecurrenceEndKind.Until, date: asYmd('2026-03-03') },
      },
    });
    const plan = TaskPlan.load(aTaskPlanState({ schedule }));
    const occurrences = ['2026-03-01', '2026-03-03'].map((date) => {
      const occurrence = TaskOccurrence.create({
        planId: plan.id,
        identityId: plan.identityId,
        scheduleSnapshot: TaskOccurrenceScheduleSnapshot.create({
          date: asYmd(date),
          timing: { kind: TaskTimingKind.AllDay },
        }),
        importanceSnapshot: ImportanceLevel.Moderate,
      });
      occurrence.complete();
      return occurrence;
    });

    expect(evaluator.evaluate(plan, occurrences, TASK_TEST_TIME_CONTEXT)).toBe(
      TaskPlanOutcome.Open,
    );
  });

  it('historical Archived/Deleted lifecycle values are rejected after destructive reset', () => {
    expect(() => TaskPlan.load(aTaskPlanState({ status: 'Archived' as any }))).toThrow();
    expect(() => TaskPlan.load(aTaskPlanState({ status: 'Deleted' as any }))).toThrow();
  });
});
