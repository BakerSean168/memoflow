import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlanScheduleKind, TaskRecurrenceEndKind } from '@memoflow/contracts/task';
import { TaskPlanStatus } from '../../domain/value-objects/task-plan-status';
import {
  aLoadedTaskPlan,
  aRecurringTask,
  aDailyRecurrence,
  anAllDayTiming,
  canonicalTaskPlanScheduleForTest,
  TASK_TEST_TIME_CONTEXT,
} from '../../../testing';
import { createTimeContext } from '@memoflow/time';
import { TaskOccurrenceGenerationService } from './task-occurrence-generation-service';

const DAY_MS = 86_400_000;

describe('TaskOccurrenceGenerationService', () => {
  let service: TaskOccurrenceGenerationService;

  beforeEach(() => {
    service = new TaskOccurrenceGenerationService();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T00:00:00Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('materializes a bounded recurring window without a generation cursor', () => {
    const plan = aRecurringTask({ title: 'Daily standup' });
    const occurrences = service.generateOccurrences(plan, TASK_TEST_TIME_CONTEXT);

    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences.length).toBeLessThanOrEqual(101);
    expect(plan.toServerDTO()).not.toHaveProperty('lastGeneratedDate');
    expect(plan.toServerDTO()).not.toHaveProperty('generateAheadDays');
  });

  it('respects an explicit target window', () => {
    const plan = aRecurringTask({ title: 'Short range' });
    const now = Date.now();
    const occurrences = service.generateOccurrences(plan, TASK_TEST_TIME_CONTEXT, {
      now,
      targetDate: now + 10 * DAY_MS,
    });

    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences.length).toBeLessThanOrEqual(11);
  });

  it('caps materialization by the finite recurrence count', () => {
    const plan = aLoadedTaskPlan({
      schedule: canonicalTaskPlanScheduleForTest(
        TaskPlanScheduleKind.Recurring,
        Date.now(),
        anAllDayTiming(),
        { ...aDailyRecurrence(), end: { kind: TaskRecurrenceEndKind.Count, count: 3 } },
      ),
      status: TaskPlanStatus.Active,
    });

    expect(service.generateOccurrences(plan, TASK_TEST_TIME_CONTEXT)).toHaveLength(3);
  });

  it('returns empty when the explicit range starts after its target', () => {
    const plan = aRecurringTask();
    const now = Date.now();

    expect(
      service.generateOccurrences(plan, TASK_TEST_TIME_CONTEXT, {
        fromDate: now + DAY_MS,
        targetDate: now,
      }),
    ).toEqual([]);
  });

  it('re-enumerates the window and repairs a missing occurrence between existing facts', () => {
    const plan = aRecurringTask({ title: 'Repair holes' });
    const now = Date.now();
    const targetDate = now + 5 * DAY_MS;
    const firstPass = service.generateOccurrences(plan, TASK_TEST_TIME_CONTEXT, {
      now,
      targetDate,
    });
    expect(firstPass.length).toBeGreaterThanOrEqual(4);

    const missing = firstPass[Math.floor(firstPass.length / 2)];
    const existingOccurrences = firstPass.filter((occurrence) => occurrence.id !== missing.id);
    const repair = service.generateOccurrences(plan, TASK_TEST_TIME_CONTEXT, {
      now,
      targetDate,
      existingOccurrences,
    });

    expect(repair.map((occurrence) => occurrence.scheduleDate)).toEqual([missing.scheduleDate]);
  });

  it('is idempotent when the bounded window is already materialized', () => {
    const plan = aRecurringTask({ title: 'Idempotent reconcile' });
    const now = Date.now();
    const targetDate = now + 5 * DAY_MS;
    const existingOccurrences = service.generateOccurrences(plan, TASK_TEST_TIME_CONTEXT, {
      now,
      targetDate,
    });

    expect(
      service.generateOccurrences(plan, TASK_TEST_TIME_CONTEXT, {
        now,
        targetDate,
        existingOccurrences,
      }),
    ).toEqual([]);
  });

  it('uses Product Time calendar dates across spring-forward DST without mutating Plan state', () => {
    const timeContext = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });
    const march8 = Date.parse('2026-03-08T05:00:00.000Z');
    const plan = aLoadedTaskPlan({
      schedule: canonicalTaskPlanScheduleForTest(
        TaskPlanScheduleKind.Recurring,
        march8,
        anAllDayTiming(),
        aDailyRecurrence(),
        timeContext,
      ),
      status: TaskPlanStatus.Active,
    });
    const before = plan.toServerDTO();

    const occurrences = service.generateOccurrences(plan, timeContext, {
      fromDate: march8,
      targetDate: Date.parse('2026-03-12T04:00:00.000Z'),
      now: march8,
    });

    expect(occurrences.map((occurrence) => occurrence.scheduleDate)).toContain('2026-03-09');
    const march9 = occurrences.find((occurrence) => occurrence.scheduleDate === '2026-03-09');
    expect(march9).toBeDefined();
    expect(Number(march9!.scheduledStartOfDayAt(timeContext)) - march8).toBe(23 * 60 * 60 * 1000);
    expect(plan.toServerDTO()).toEqual(before);
    expect(Reflect.get(plan, 'occurrences')).toBeUndefined();
    expect(Reflect.get(plan, 'generateOccurrences')).toBeUndefined();
  });
});
