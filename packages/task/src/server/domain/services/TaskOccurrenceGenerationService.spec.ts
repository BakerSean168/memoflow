/**
 * TaskOccurrenceGenerationService Tests
 *
 * Tests the domain service that calculates which instances to generate
 * for a recurring task template. Pure domain logic — no persistence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskOccurrenceGenerationService } from './task-occurrence-generation-service';
import { TaskPlan } from '../aggregates';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskPlanStatus } from '../../domain/value-objects/task-plan-status';
import { TaskType } from '@memoflow/contracts/task';
import {
  aRecurringTask,
  aOneTimeTask,
  aLoadedTaskPlan,
  anAllDayTimeConfig,
  aDailyRecurrenceRule,
  TASK_TEST_TIME_CONTEXT,
} from '../../../testing';
import { createTimeContext, createTimeFacade } from '@memoflow/time';

const DAY_MS = 86400000;

describe('TaskOccurrenceGenerationService', () => {
  let service: TaskOccurrenceGenerationService;

  beforeEach(() => {
    service = new TaskOccurrenceGenerationService();
    // Pin Date.now for deterministic tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── generateInstances ─────────────────────────────────────────

  describe('generateInstances', () => {
    it('should generate instances for a recurring template with no prior generation', () => {
      const template = aRecurringTask({ title: 'Daily standup' });
      const instances = service.generateInstances(template, TASK_TEST_TIME_CONTEXT);

      // With 100-day target and daily recurrence, expect ~100 instances
      expect(instances.length).toBeGreaterThan(0);
      expect(instances.length).toBeLessThanOrEqual(101);
    });

    it('should respect targetDate override', () => {
      const template = aRecurringTask({ title: 'Short range' });
      const now = Date.now();
      const tenDaysLater = now + 10 * DAY_MS;

      const instances = service.generateInstances(template, TASK_TEST_TIME_CONTEXT, { targetDate: tenDaysLater });

      // Should generate at most ~10 instances
      expect(instances.length).toBeLessThanOrEqual(11);
      expect(instances.length).toBeGreaterThan(0);
    });

    it('should cap generated instances by recurrence occurrence limit', () => {
      const template = aLoadedTaskPlan({
        taskType: TaskType.Recurring,
        status: TaskPlanStatus.Active,
        timeConfig: anAllDayTimeConfig(),
        recurrenceRule: aDailyRecurrenceRule().setOccurrences(3),
      });

      const instances = service.generateInstances(template, TASK_TEST_TIME_CONTEXT);

      expect(instances).toHaveLength(3);
    });

    it('should return empty array when fromDate exceeds targetDate', () => {
      // Create a template where lastGeneratedDate is far in the future
      const farFuture = Date.now() + 200 * DAY_MS;
      const template = aLoadedTaskPlan({
        taskType: TaskType.Recurring,
        timeConfig: anAllDayTimeConfig(),
        recurrenceRule: aDailyRecurrenceRule(),
        lastGeneratedDate: farFuture,
        status: TaskPlanStatus.Active,
      });

      const instances = service.generateInstances(template, TASK_TEST_TIME_CONTEXT);
      expect(instances).toHaveLength(0);
    });

    it('should use forceGenerate to start from today even if lastGeneratedDate exists', () => {
      const yesterday = Date.now() - DAY_MS;
      const createTemplate = () =>
        aLoadedTaskPlan({
          taskType: TaskType.Recurring,
          timeConfig: anAllDayTimeConfig(),
          recurrenceRule: aDailyRecurrenceRule(),
          lastGeneratedDate: yesterday,
          status: TaskPlanStatus.Active,
        });

      // Without forceGenerate — starts from lastGeneratedDate + 1 day = today
      const normal = service.generateInstances(createTemplate(), TASK_TEST_TIME_CONTEXT, { forceGenerate: false });

      // With forceGenerate — starts from today regardless
      const forced = service.generateInstances(createTemplate(), TASK_TEST_TIME_CONTEXT, { forceGenerate: true });

      // Use isolated aggregates because a generation mutates the template's instance collection.
      expect(normal.length).toBeGreaterThan(0);
      expect(forced.length).toBeGreaterThan(0);
    });

    it('advances the generation cursor by a Product Time calendar day across DST', () => {
      const timeContext = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });
      const time = createTimeFacade({ context: timeContext });
      const lastGeneratedDate = Date.parse('2026-03-08T05:00:00.000Z');
      const template = aLoadedTaskPlan({
        taskType: TaskType.Recurring,
        status: TaskPlanStatus.Active,
        timeConfig: anAllDayTimeConfig(new Date(lastGeneratedDate)),
        recurrenceRule: aDailyRecurrenceRule(),
        lastGeneratedDate,
      });
      const spy = vi.spyOn(template, 'generateInstances').mockReturnValue([]);
      service.generateInstances(template, timeContext, {
        targetDate: Date.parse('2026-03-12T04:00:00.000Z'),
      });
      const [fromDate, , delegatedContext] = spy.mock.calls[0];
      expect(String(time.calendar.toYmd(fromDate))).toBe('2026-03-09');
      expect(fromDate - lastGeneratedDate).toBe(23 * 60 * 60 * 1000);
      expect(delegatedContext).toEqual(timeContext);
    });

    it('should delegate to template.generateInstances with correct date range', () => {
      const template = aRecurringTask({ title: 'Spy test' });
      const spy = vi.spyOn(template, 'generateInstances');

      service.generateInstances(template, TASK_TEST_TIME_CONTEXT);

      expect(spy).toHaveBeenCalledOnce();
      const [fromDate, toDate] = spy.mock.calls[0];
      expect(fromDate).toBeTypeOf('number');
      expect(toDate).toBeTypeOf('number');
      expect(toDate).toBeGreaterThan(fromDate);
    });
  });

  // ─── shouldRefillInstances ─────────────────────────────────────

  describe('shouldRefillInstances', () => {
    it('should return false for non-Active templates', () => {
      const paused = aLoadedTaskPlan({
        taskType: TaskType.Recurring,
        status: TaskPlanStatus.Paused,
        timeConfig: anAllDayTimeConfig(),
        recurrenceRule: aDailyRecurrenceRule(),
      });

      expect(service.shouldRefillInstances(paused, TASK_TEST_TIME_CONTEXT)).toBe(false);
    });

    it('archive metadata does not stop an otherwise Active recurring plan', () => {
      const archived = aLoadedTaskPlan({
        taskType: TaskType.Recurring,
        status: TaskPlanStatus.Active,
        archivedAt: Date.now(),
        timeConfig: anAllDayTimeConfig(),
        recurrenceRule: aDailyRecurrenceRule(),
        lastGeneratedDate: null,
      });
      expect(service.shouldRefillInstances(archived, TASK_TEST_TIME_CONTEXT)).toBe(true);
    });

    it('should return true for Active template with no lastGeneratedDate', () => {
      const template = aLoadedTaskPlan({
        taskType: TaskType.Recurring,
        status: TaskPlanStatus.Active,
        timeConfig: anAllDayTimeConfig(),
        recurrenceRule: aDailyRecurrenceRule(),
        lastGeneratedDate: null,
      });

      // lastGeneratedDate is null => 0 ms => daysRemaining is negative => needs refill
      expect(service.shouldRefillInstances(template, TASK_TEST_TIME_CONTEXT)).toBe(true);
    });

    it('should return true when remaining days is below threshold', () => {
      // lastGeneratedDate only 10 days ahead — below the 100-day threshold
      const tenDaysAhead = new Date(Date.now() + 10 * DAY_MS);
      const template = aLoadedTaskPlan({
        taskType: TaskType.Recurring,
        status: TaskPlanStatus.Active,
        timeConfig: anAllDayTimeConfig(),
        recurrenceRule: aDailyRecurrenceRule(),
        lastGeneratedDate: tenDaysAhead,
      });

      expect(service.shouldRefillInstances(template, TASK_TEST_TIME_CONTEXT)).toBe(true);
    });

    it('should return false when remaining days exceeds threshold', () => {
      // lastGeneratedDate 150 days ahead — above the 100-day threshold
      const farAhead = new Date(Date.now() + 150 * DAY_MS);
      const template = aLoadedTaskPlan({
        taskType: TaskType.Recurring,
        status: TaskPlanStatus.Active,
        timeConfig: anAllDayTimeConfig(),
        recurrenceRule: aDailyRecurrenceRule(),
        lastGeneratedDate: farAhead,
      });

      expect(service.shouldRefillInstances(template, TASK_TEST_TIME_CONTEXT)).toBe(false);
    });
  });

  // ─── calculateRefillTargetDate ─────────────────────────────────

  describe('calculateRefillTargetDate', () => {
    it('should return a date 100 days from now', () => {
      const target = service.calculateRefillTargetDate(TASK_TEST_TIME_CONTEXT);
      const expected = Date.now() + 100 * DAY_MS;

      // Allow small tolerance for execution time
      expect(target).toBe(expected);
    });
  });
});
