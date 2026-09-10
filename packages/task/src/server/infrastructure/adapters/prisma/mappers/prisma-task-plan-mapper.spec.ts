import { describe, expect, it } from 'vitest';
import { aPrefixedUuid } from '@memoflow/test-utils/fixtures';
import { PrismaTaskPlanMapper } from './prisma-task-plan-mapper';
import type { TaskPlan as PrismaTaskPlan } from '@memoflow/database';
import { TaskPlan } from '../../../../domain/aggregates/task-plan';
import { TASK_TEST_TIME_CONTEXT } from '../../../../../testing';

describe('PrismaTaskPlanMapper', () => {
  const legacyTimeConfig = (domain: TaskPlan) =>
    domain.schedule.toLegacyTimeConfig(TASK_TEST_TIME_CONTEXT);
  const legacyRecurrenceRule = (domain: TaskPlan) =>
    domain.schedule.toLegacyRecurrenceRule(TASK_TEST_TIME_CONTEXT);
  const TEMPLATE_ID_1 = aPrefixedUuid('ITaskPlanId', 'task-plan-1');
  const TEMPLATE_ID_2 = aPrefixedUuid('ITaskPlanId', 'task-plan-2');
  const TEMPLATE_ID_3 = aPrefixedUuid('ITaskPlanId', 'task-plan-3');
  const IDENTITY_ID_1 = aPrefixedUuid('IdentityId', 'task-plan-owner-1');
  const IDENTITY_ID_2 = aPrefixedUuid('IdentityId', 'task-plan-owner-2');
  const IDENTITY_ID_3 = aPrefixedUuid('IdentityId', 'task-plan-owner-3');
  const GOAL_ID_1 = aPrefixedUuid('GoalId', 'goal-1');
  const KEY_RESULT_ID_1 = aPrefixedUuid('KeyResultId', 'key-result-1');

  const createMinimalRow = (): PrismaTaskPlan => ({
    id: TEMPLATE_ID_1,
    identityId: IDENTITY_ID_1,
    name: 'Simple Task',
    description: null,
    importance: 'Moderate',
    status: 'Active',
    version: 1,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    deletedAt: null,
    // Time config fields
    timeConfigType: 'AllDay',
    timeConfigStartTime: new Date('2024-01-01T00:00:00Z'),
    timeConfigEndTime: null,
    timeConfigDurationMinutes: null,
    timeConfigTimePoint: null,
    timeConfigTimeRangeStart: null,
    timeConfigTimeRangeEnd: null,
    // Recurrence fields
    recurrenceRuleType: null,
    recurrenceRuleInterval: null,
    recurrenceRuleDaysOfWeek: null,
    recurrenceRuleDayOfMonth: null,
    recurrenceRuleMonthOfYear: null,
    recurrenceRuleEndDate: null,
    recurrenceRuleCount: null,
    // Reminder fields
    reminderConfigEnabled: null,
    reminderConfigTimeOffsetMinutes: null,
    reminderConfigUnit: null,
    reminderConfigChannel: null,
    // Other fields
    goalId: null,
    keyResultId: null,
    goalRecordValue: null,
    goalProgressTrigger: null,
    checklist: null,
    lastGeneratedDate: null,
    generateAheadDays: null,
  });

  const createFullRow = (): PrismaTaskPlan => ({
    id: TEMPLATE_ID_2,
    identityId: IDENTITY_ID_2,
    name: 'Complex Recurring Task',
    description: 'A task with full configuration',
    importance: 'Important',
    status: 'Active',
    version: 2,
    createdAt: new Date('2024-02-01T10:30:45Z'),
    updatedAt: new Date('2024-02-15T14:45:30Z'),
    deletedAt: null,
    // Time config fields
    timeConfigType: 'TimeRange',
    timeConfigStartTime: new Date('2024-03-01T00:00:00Z'),
    timeConfigEndTime: null,
    timeConfigDurationMinutes: 60,
    timeConfigTimePoint: null,
    timeConfigTimeRangeStart: 540,
    timeConfigTimeRangeEnd: 1020,
    // Recurrence fields
    recurrenceRuleType: 'Daily',
    recurrenceRuleInterval: 1,
    recurrenceRuleDaysOfWeek: JSON.stringify([]),
    recurrenceRuleDayOfMonth: null,
    recurrenceRuleMonthOfYear: null,
    recurrenceRuleEndDate: new Date('2024-12-31T00:00:00Z'),
    recurrenceRuleCount: null,
    // Reminder fields
    reminderConfigEnabled: true,
    reminderConfigTimeOffsetMinutes: 15,
    reminderConfigUnit: 'Minutes',
    reminderConfigChannel: 'PUSH',
    // Other fields
    goalId: GOAL_ID_1,
    keyResultId: KEY_RESULT_ID_1,
    goalRecordValue: 2,
    goalProgressTrigger: 'EachCompletion',
    checklist: JSON.stringify([
      { title: 'Step 1', order: 1 },
      { title: 'Step 2', order: 2 },
    ]),
    lastGeneratedDate: new Date('2024-02-29T00:00:00Z'),
    generateAheadDays: 7,
  });

  /** Creates a TaskPlan aggregate from a Prisma row for use with toPersistence */
  const createTestAggregate = (rowOverrides?: Partial<PrismaTaskPlan>): TaskPlan => {
    const row = { ...createMinimalRow(), ...rowOverrides };
    return PrismaTaskPlanMapper.toDomain(row);
  };

  describe('toDomain', () => {
    it('maps minimal Prisma row to domain aggregate', () => {
      const row = createMinimalRow();
      const domain = PrismaTaskPlanMapper.toDomain(row);

      expect(domain.id).toBe(TEMPLATE_ID_1);
      expect(domain.title).toBe('Simple Task');
      expect(domain.description).toBeNull();
      expect(domain.importance).toBe('Moderate');
      expect(domain.status).toBe('Active');
      expect(domain.version).toBe(1);
      expect(legacyTimeConfig(domain).timeType).toBe('AllDay');
      expect(legacyRecurrenceRule(domain)).toBeNull();
      expect(domain.reminderConfig).toBeNull();
      expect(domain.goalBinding).toBeNull();
      expect(domain.checklist).toEqual([]);
    });

    it('maps full Prisma row with all fields to domain', () => {
      const row = createFullRow();
      const domain = PrismaTaskPlanMapper.toDomain(row);

      expect(domain.id).toBe(TEMPLATE_ID_2);
      expect(domain.title).toBe('Complex Recurring Task');
      expect(domain.description).toBe('A task with full configuration');
      expect(domain.importance).toBe('Important');
      expect(domain.status).toBe('Active');
      expect(domain.version).toBe(2);
    });

    it('parses timeConfig when present', () => {
      const row = createFullRow();
      const domain = PrismaTaskPlanMapper.toDomain(row);

      expect(legacyTimeConfig(domain)).toBeDefined();
      expect(legacyTimeConfig(domain).timeType).toBe('TimeRange');
      expect(legacyTimeConfig(domain).timeRange).toEqual({ start: 540, end: 1020 });
    });

    it('returns null timeConfig when not configured', () => {
      const row = createMinimalRow();
      const domain = PrismaTaskPlanMapper.toDomain(row);

      expect(legacyTimeConfig(domain).timeType).toBe('AllDay');
    });

    it('parses recurrenceRule when present', () => {
      const row = createFullRow();
      const domain = PrismaTaskPlanMapper.toDomain(row);

      expect(legacyRecurrenceRule(domain)).toBeDefined();
      expect(legacyRecurrenceRule(domain)?.frequency).toBe('Daily');
      expect(legacyRecurrenceRule(domain)?.interval).toBe(1);
      expect(legacyRecurrenceRule(domain)?.daysOfWeek).toEqual([]);
    });

    it('returns null recurrenceRule when not configured', () => {
      const row = createMinimalRow();
      const domain = PrismaTaskPlanMapper.toDomain(row);

      expect(legacyRecurrenceRule(domain)).toBeNull();
    });

    it('parses reminderConfig when enabled', () => {
      const row = createFullRow();
      const domain = PrismaTaskPlanMapper.toDomain(row);

      expect(domain.reminderConfig).toBeDefined();
      expect(domain.reminderConfig?.enabled).toBe(true);
      expect(domain.reminderConfig?.triggers).toBeDefined();
      expect(domain.reminderConfig?.triggers[0].relativeValue).toBe(15);
      expect(domain.reminderConfig?.triggers[0].relativeUnit).toBe('Minutes');
    });

    it('returns null reminderConfig when disabled', () => {
      const row = createMinimalRow();
      const domain = PrismaTaskPlanMapper.toDomain(row);

      expect(domain.reminderConfig).toBeNull();
    });

    it('reconstructs goal binding from relation columns', () => {
      const row = createFullRow();
      const domain = PrismaTaskPlanMapper.toDomain(row);

      expect(domain.goalBinding).toBeDefined();
      expect(domain.goalBinding?.toDTO()).toEqual({
        goalId: GOAL_ID_1,
        keyResultId: KEY_RESULT_ID_1,
        contribution: { value: 2, trigger: 'EachCompletion' },
      });
    });

    it('parses checklist from JSON', () => {
      const row = createFullRow();
      const domain = PrismaTaskPlanMapper.toDomain(row);

      expect(domain.checklist).toHaveLength(2);
      expect(domain.checklist[0].title).toBe('Step 1');
      expect(domain.checklist[1].title).toBe('Step 2');
    });

    it('returns empty checklist when not configured', () => {
      const row = createMinimalRow();
      const domain = PrismaTaskPlanMapper.toDomain(row);

      expect(domain.checklist).toEqual([]);
    });
  });

  describe('toPersistence', () => {
    it('converts minimal aggregate to persistence format', () => {
      const aggregate = createTestAggregate({
        id: TEMPLATE_ID_3,
        identityId: IDENTITY_ID_3,
        name: 'New Task',
        importance: 'Minor',
      });

      const persistence = PrismaTaskPlanMapper.toPersistence(aggregate);

      expect(persistence.name).toBe('New Task');
      expect(persistence.description).toBeNull();
      expect(persistence.importance).toBe('Minor');
      expect(persistence.timeConfigType).toBe('AllDay');
      expect(persistence.recurrenceRuleType).toBeNull();
      expect(persistence.reminderConfigEnabled).toBeNull();
      expect(persistence.goalId).toBeNull();
      expect(persistence.keyResultId).toBeNull();
      expect(persistence.goalRecordValue).toBeNull();
      expect(persistence.goalProgressTrigger).toBeNull();
      expect(persistence.checklist).toBeNull();
    });

    it('writes canonical calendar dates as UTC-midnight compatibility values', () => {
      const aggregate = createTestAggregate({
        timeConfigStartTime: new Date('2026-03-08T00:00:00.000Z'),
        recurrenceRuleType: 'Daily',
        recurrenceRuleInterval: 1,
        recurrenceRuleDaysOfWeek: JSON.stringify([]),
        recurrenceRuleEndDate: new Date('2026-03-09T00:00:00.000Z'),
      });

      expect(String(aggregate.schedule.calendarDate)).toBe('2026-03-08');
      expect(aggregate.schedule.recurrence?.end).toEqual({ kind: 'Until', date: '2026-03-09' });

      const persistence = PrismaTaskPlanMapper.toPersistence(aggregate);
      expect(persistence.timeConfigStartTime?.toISOString()).toBe('2026-03-08T00:00:00.000Z');
      expect(persistence.recurrenceRuleEndDate?.toISOString()).toBe('2026-03-09T00:00:00.000Z');
    });

    it('converts full aggregate with all fields to persistence', () => {
      const aggregate = createTestAggregate(createFullRow());

      const persistence = PrismaTaskPlanMapper.toPersistence(aggregate);

      expect(persistence.name).toBe('Complex Recurring Task');
      expect(persistence.importance).toBe('Important');
      expect(persistence.timeConfigType).toBe('TimeRange');
      expect(persistence.timeConfigTimeRangeStart).toBe(540);
      expect(persistence.timeConfigTimeRangeEnd).toBe(1020);
      expect(persistence.recurrenceRuleType).toBe('Daily');
      expect(persistence.recurrenceRuleInterval).toBe(1);
      expect(persistence.reminderConfigEnabled).toBe(true);
      expect(persistence.reminderConfigTimeOffsetMinutes).toBe(15);
      expect(persistence.generateAheadDays).toBe(7);
    });

    it('serializes checklist and expands the goal binding', () => {
      const aggregate = createTestAggregate(createFullRow());

      const persistence = PrismaTaskPlanMapper.toPersistence(aggregate);

      expect(persistence.goalId).toBe(GOAL_ID_1);
      expect(persistence.keyResultId).toBe(KEY_RESULT_ID_1);
      expect(persistence.goalRecordValue).toBe(2);
      expect(persistence.goalProgressTrigger).toBe('EachCompletion');
      expect(typeof persistence.checklist).toBe('string');
    });

    it('stringifies JSON for recurrence days of week', () => {
      const aggregate = createTestAggregate({
        recurrenceRuleType: 'Weekly',
        recurrenceRuleInterval: 1,
        recurrenceRuleDaysOfWeek: JSON.stringify([1, 3, 5]),
      });

      const persistence = PrismaTaskPlanMapper.toPersistence(aggregate);

      expect(typeof persistence.recurrenceRuleDaysOfWeek).toBe('string');
      expect(JSON.parse(persistence.recurrenceRuleDaysOfWeek!)).toEqual([1, 3, 5]);
    });

    it('handles empty checklist correctly', () => {
      const aggregate = createTestAggregate({ checklist: null });

      const persistence = PrismaTaskPlanMapper.toPersistence(aggregate);

      expect(persistence.checklist).toBeNull();
    });

    it('handles null fields correctly', () => {
      const aggregate = createTestAggregate();

      const persistence = PrismaTaskPlanMapper.toPersistence(aggregate);

      expect(persistence.description).toBeNull();
      expect(persistence.timeConfigType).toBe('AllDay');
      expect(persistence.goalId).toBeNull();
    });
  });

  describe('Round-trip: toDomain -> toPersistence', () => {
    it('preserves task template data integrity', () => {
      const originalRow = createFullRow();
      const aggregate = PrismaTaskPlanMapper.toDomain(originalRow);
      const persistence = PrismaTaskPlanMapper.toPersistence(aggregate);

      expect(persistence.name).toBe(originalRow.name);
      expect(persistence.description).toBe(originalRow.description);
      expect(persistence.importance).toBe(originalRow.importance);
      expect(persistence.status).toBe(originalRow.status);
      expect(persistence.version).toBe(originalRow.version);
    });
  });

  describe('toDomainList', () => {
    it('maps empty list', () => {
      const result = PrismaTaskPlanMapper.toDomainList([]);
      expect(result).toEqual([]);
    });

    it('maps multiple rows preserving order', () => {
      const rows = [createMinimalRow(), createFullRow(), createMinimalRow()];
      const domains = PrismaTaskPlanMapper.toDomainList(rows);

      expect(domains).toHaveLength(3);
      expect(domains[0].id).toBe(TEMPLATE_ID_1);
      expect(domains[1].id).toBe(TEMPLATE_ID_2);
      expect(domains[2].id).toBe(TEMPLATE_ID_1);
    });
  });
});
