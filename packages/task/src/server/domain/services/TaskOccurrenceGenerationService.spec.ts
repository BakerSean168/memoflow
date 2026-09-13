import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskType } from '@memoflow/contracts/task';
import { TaskPlanStatus } from '../../domain/value-objects/task-plan-status';
import {
  aLoadedTaskPlan,
  aRecurringTask,
  anAllDayTimeConfig,
  aDailyRecurrenceRule,
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
    const template = aRecurringTask({ title: 'Daily standup' });
    const instances = service.generateInstances(template, TASK_TEST_TIME_CONTEXT);

    expect(instances.length).toBeGreaterThan(0);
    expect(instances.length).toBeLessThanOrEqual(101);
    expect(template.toServerDTO()).not.toHaveProperty('lastGeneratedDate');
    expect(template.toServerDTO()).not.toHaveProperty('generateAheadDays');
  });

  it('respects an explicit target window', () => {
    const template = aRecurringTask({ title: 'Short range' });
    const now = Date.now();
    const instances = service.generateInstances(template, TASK_TEST_TIME_CONTEXT, {
      now,
      targetDate: now + 10 * DAY_MS,
    });

    expect(instances.length).toBeGreaterThan(0);
    expect(instances.length).toBeLessThanOrEqual(11);
  });

  it('caps materialization by the finite recurrence count', () => {
    const template = aLoadedTaskPlan({
      taskType: TaskType.Recurring,
      status: TaskPlanStatus.Active,
      timeConfig: anAllDayTimeConfig(),
      recurrenceRule: aDailyRecurrenceRule().setOccurrences(3),
    });

    expect(service.generateInstances(template, TASK_TEST_TIME_CONTEXT)).toHaveLength(3);
  });

  it('returns empty when the explicit range starts after its target', () => {
    const template = aRecurringTask();
    const now = Date.now();

    expect(
      service.generateInstances(template, TASK_TEST_TIME_CONTEXT, {
        fromDate: now + DAY_MS,
        targetDate: now,
      }),
    ).toEqual([]);
  });

  it('re-enumerates the window and repairs a missing occurrence between existing facts', () => {
    const template = aRecurringTask({ title: 'Repair holes' });
    const now = Date.now();
    const targetDate = now + 5 * DAY_MS;
    const firstPass = service.generateInstances(template, TASK_TEST_TIME_CONTEXT, {
      now,
      targetDate,
    });
    expect(firstPass.length).toBeGreaterThanOrEqual(4);

    const missing = firstPass[Math.floor(firstPass.length / 2)];
    const existingInstances = firstPass.filter((instance) => instance.id !== missing.id);
    const repair = service.generateInstances(template, TASK_TEST_TIME_CONTEXT, {
      now,
      targetDate,
      existingInstances,
    });

    expect(repair.map((instance) => instance.scheduleDate)).toEqual([missing.scheduleDate]);
  });

  it('is idempotent when the bounded window is already materialized', () => {
    const template = aRecurringTask({ title: 'Idempotent reconcile' });
    const now = Date.now();
    const targetDate = now + 5 * DAY_MS;
    const existingInstances = service.generateInstances(template, TASK_TEST_TIME_CONTEXT, {
      now,
      targetDate,
    });

    expect(
      service.generateInstances(template, TASK_TEST_TIME_CONTEXT, {
        now,
        targetDate,
        existingInstances,
      }),
    ).toEqual([]);
  });

  it('uses Product Time calendar dates across spring-forward DST without mutating Plan state', () => {
    const timeContext = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });
    const march8 = Date.parse('2026-03-08T05:00:00.000Z');
    const template = aLoadedTaskPlan({
      taskType: TaskType.Recurring,
      status: TaskPlanStatus.Active,
      timeConfig: anAllDayTimeConfig(new Date(march8)),
      recurrenceRule: aDailyRecurrenceRule(),
    });
    const before = template.toServerDTO();

    const instances = service.generateInstances(template, timeContext, {
      fromDate: march8,
      targetDate: Date.parse('2026-03-12T04:00:00.000Z'),
      now: march8,
    });

    expect(instances.map((instance) => instance.scheduleDate)).toContain('2026-03-09');
    const march9 = instances.find((instance) => instance.scheduleDate === '2026-03-09');
    expect(march9).toBeDefined();
    expect(Number(march9!.scheduledStartOfDayAt(timeContext)) - march8).toBe(23 * 60 * 60 * 1000);
    expect(template.toServerDTO()).toEqual(before);
    expect(Reflect.get(template, 'instances')).toBeUndefined();
    expect(Reflect.get(template, 'generateInstances')).toBeUndefined();
  });
});
