import { describe, expect, it } from 'vitest';
import { aPrefixedUuid } from '@memoflow/test-utils/fixtures';
import { PrismaTaskTemplateMapper } from './prisma-task-template-mapper';
import type { TaskTemplate as PrismaTaskTemplate } from '@memoflow/database';
import { TaskTemplate } from '../../../../domain/aggregates/task-template';

describe('PrismaTaskTemplateMapper', () => {
  const TEMPLATE_ID_1 = aPrefixedUuid('ITaskTemplateId', 'task-template-1');
  const TEMPLATE_ID_2 = aPrefixedUuid('ITaskTemplateId', 'task-template-2');
  const TEMPLATE_ID_3 = aPrefixedUuid('ITaskTemplateId', 'task-template-3');
  const IDENTITY_ID_1 = aPrefixedUuid('IdentityId', 'task-template-owner-1');
  const IDENTITY_ID_2 = aPrefixedUuid('IdentityId', 'task-template-owner-2');
  const IDENTITY_ID_3 = aPrefixedUuid('IdentityId', 'task-template-owner-3');
  const GOAL_ID_1 = aPrefixedUuid('GoalId', 'goal-1');
  const KEY_RESULT_ID_1 = aPrefixedUuid('KeyResultId', 'key-result-1');

  const createMinimalRow = (): PrismaTaskTemplate => ({
    id: TEMPLATE_ID_1,
    identityId: IDENTITY_ID_1,
    name: 'Simple Task',
    description: null,
    importance: 'Moderate',
    color: null,
    tags: '[]',
    status: 'Active',
    version: 1,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    deletedAt: null,
    // Time config fields
    timeConfigType: null,
    timeConfigStartTime: null,
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

  const createFullRow = (): PrismaTaskTemplate => ({
    id: TEMPLATE_ID_2,
    identityId: IDENTITY_ID_2,
    name: 'Complex Recurring Task',
    description: 'A task with full configuration',
    importance: 'Important',
    color: '#FF5733',
    tags: JSON.stringify(['urgent', 'work']),
    status: 'Active',
    version: 2,
    createdAt: new Date('2024-02-01T10:30:45Z'),
    updatedAt: new Date('2024-02-15T14:45:30Z'),
    deletedAt: null,
    // Time config fields
    timeConfigType: 'FixedTime',
    timeConfigStartTime: new Date('2024-03-01T00:00:00Z'),
    timeConfigEndTime: null,
    timeConfigDurationMinutes: 60,
    timeConfigTimePoint: '09:00',
    timeConfigTimeRangeStart: 9,
    timeConfigTimeRangeEnd: 17,
    // Recurrence fields
    recurrenceRuleType: 'DAILY',
    recurrenceRuleInterval: 1,
    recurrenceRuleDaysOfWeek: JSON.stringify(['MON', 'WED', 'FRI']),
    recurrenceRuleDayOfMonth: null,
    recurrenceRuleMonthOfYear: null,
    recurrenceRuleEndDate: new Date('2024-12-31T00:00:00Z'),
    recurrenceRuleCount: null,
    // Reminder fields
    reminderConfigEnabled: true,
    reminderConfigTimeOffsetMinutes: 15,
    reminderConfigUnit: 'minutes',
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

  /** Creates a TaskTemplate aggregate from a Prisma row for use with toPersistence */
  const createTestAggregate = (rowOverrides?: Partial<PrismaTaskTemplate>): TaskTemplate => {
    const row = { ...createMinimalRow(), ...rowOverrides };
    return PrismaTaskTemplateMapper.toDomain(row);
  };

  describe('toDomain', () => {
    it('maps minimal Prisma row to domain aggregate', () => {
      const row = createMinimalRow();
      const domain = PrismaTaskTemplateMapper.toDomain(row);

      expect(domain.id).toBe(TEMPLATE_ID_1);
      expect(domain.title).toBe('Simple Task');
      expect(domain.description).toBeNull();
      expect(domain.importance).toBe('Moderate');
      expect(domain.color).toBeNull();
      expect(domain.tags).toEqual([]);
      expect(domain.status).toBe('Active');
      expect(domain.version).toBe(1);
      expect(domain.timeConfig).toBeNull();
      expect(domain.recurrenceRule).toBeNull();
      expect(domain.reminderConfig).toBeNull();
      expect(domain.goalBinding).toBeNull();
      expect(domain.checklist).toEqual([]);
    });

    it('maps full Prisma row with all fields to domain', () => {
      const row = createFullRow();
      const domain = PrismaTaskTemplateMapper.toDomain(row);

      expect(domain.id).toBe(TEMPLATE_ID_2);
      expect(domain.title).toBe('Complex Recurring Task');
      expect(domain.description).toBe('A task with full configuration');
      expect(domain.importance).toBe('Important');
      expect(domain.color).toBe('#FF5733');
      expect(domain.tags).toEqual(['urgent', 'work']);
      expect(domain.status).toBe('Active');
      expect(domain.version).toBe(2);
    });

    it('parses JSON tags correctly', () => {
      const row = createFullRow();
      const domain = PrismaTaskTemplateMapper.toDomain(row);

      expect(domain.tags).toEqual(['urgent', 'work']);
    });

    it('parses timeConfig when present', () => {
      const row = createFullRow();
      const domain = PrismaTaskTemplateMapper.toDomain(row);

      expect(domain.timeConfig).toBeDefined();
      expect(domain.timeConfig?.timeType).toBe('FixedTime');
      expect(domain.timeConfig?.timePoint).toBe('09:00');
    });

    it('returns null timeConfig when not configured', () => {
      const row = createMinimalRow();
      const domain = PrismaTaskTemplateMapper.toDomain(row);

      expect(domain.timeConfig).toBeNull();
    });

    it('parses recurrenceRule when present', () => {
      const row = createFullRow();
      const domain = PrismaTaskTemplateMapper.toDomain(row);

      expect(domain.recurrenceRule).toBeDefined();
      expect(domain.recurrenceRule?.frequency).toBe('DAILY');
      expect(domain.recurrenceRule?.interval).toBe(1);
      expect(domain.recurrenceRule?.daysOfWeek).toEqual(['MON', 'WED', 'FRI']);
    });

    it('returns null recurrenceRule when not configured', () => {
      const row = createMinimalRow();
      const domain = PrismaTaskTemplateMapper.toDomain(row);

      expect(domain.recurrenceRule).toBeNull();
    });

    it('parses reminderConfig when enabled', () => {
      const row = createFullRow();
      const domain = PrismaTaskTemplateMapper.toDomain(row);

      expect(domain.reminderConfig).toBeDefined();
      expect(domain.reminderConfig?.enabled).toBe(true);
      expect(domain.reminderConfig?.triggers).toBeDefined();
      expect(domain.reminderConfig?.triggers[0].relativeValue).toBe(15);
      expect(domain.reminderConfig?.triggers[0].relativeUnit).toBe('minutes');
    });

    it('returns null reminderConfig when disabled', () => {
      const row = createMinimalRow();
      const domain = PrismaTaskTemplateMapper.toDomain(row);

      expect(domain.reminderConfig).toBeNull();
    });

    it('reconstructs goal binding from relation columns', () => {
      const row = createFullRow();
      const domain = PrismaTaskTemplateMapper.toDomain(row);

      expect(domain.goalBinding).toBeDefined();
      expect(domain.goalBinding?.toDTO()).toEqual({
        goalId: GOAL_ID_1,
        keyResultId: KEY_RESULT_ID_1,
        contribution: { value: 2, trigger: 'EachCompletion' },
      });
    });

    it('parses checklist from JSON', () => {
      const row = createFullRow();
      const domain = PrismaTaskTemplateMapper.toDomain(row);

      expect(domain.checklist).toHaveLength(2);
      expect(domain.checklist[0].title).toBe('Step 1');
      expect(domain.checklist[1].title).toBe('Step 2');
    });

    it('returns empty checklist when not configured', () => {
      const row = createMinimalRow();
      const domain = PrismaTaskTemplateMapper.toDomain(row);

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

      const persistence = PrismaTaskTemplateMapper.toPersistence(aggregate);

      expect(persistence.name).toBe('New Task');
      expect(persistence.description).toBeNull();
      expect(persistence.importance).toBe('Minor');
      expect(persistence.tags).toBe('[]');
      expect(persistence.timeConfigType).toBeNull();
      expect(persistence.recurrenceRuleType).toBeNull();
      expect(persistence.reminderConfigEnabled).toBeNull();
      expect(persistence.goalId).toBeNull();
      expect(persistence.keyResultId).toBeNull();
      expect(persistence.goalRecordValue).toBeNull();
      expect(persistence.goalProgressTrigger).toBeNull();
      expect(persistence.checklist).toBeNull();
    });

    it('converts full aggregate with all fields to persistence', () => {
      const aggregate = createTestAggregate(createFullRow());

      const persistence = PrismaTaskTemplateMapper.toPersistence(aggregate);

      expect(persistence.name).toBe('Complex Recurring Task');
      expect(persistence.importance).toBe('Important');
      expect(persistence.color).toBe('#FF5733');
      expect(persistence.timeConfigType).toBe('FixedTime');
      expect(persistence.timeConfigTimePoint).toBe('09:00');
      expect(persistence.recurrenceRuleType).toBe('DAILY');
      expect(persistence.recurrenceRuleInterval).toBe(1);
      expect(persistence.reminderConfigEnabled).toBe(true);
      expect(persistence.reminderConfigTimeOffsetMinutes).toBe(15);
      expect(persistence.generateAheadDays).toBe(7);
    });

    it('serializes JSON collections and expands the goal binding', () => {
      const aggregate = createTestAggregate(createFullRow());

      const persistence = PrismaTaskTemplateMapper.toPersistence(aggregate);

      expect(typeof persistence.tags).toBe('string');
      expect(JSON.parse(persistence.tags!)).toEqual(['urgent', 'work']);
      expect(persistence.goalId).toBe(GOAL_ID_1);
      expect(persistence.keyResultId).toBe(KEY_RESULT_ID_1);
      expect(persistence.goalRecordValue).toBe(2);
      expect(persistence.goalProgressTrigger).toBe('EachCompletion');
      expect(typeof persistence.checklist).toBe('string');
    });

    it('stringifies JSON for recurrence days of week', () => {
      const aggregate = createTestAggregate({
        recurrenceRuleType: 'DAILY',
        recurrenceRuleInterval: 1,
        recurrenceRuleDaysOfWeek: JSON.stringify(['MON', 'WED', 'FRI']),
      });

      const persistence = PrismaTaskTemplateMapper.toPersistence(aggregate);

      expect(typeof persistence.recurrenceRuleDaysOfWeek).toBe('string');
      expect(JSON.parse(persistence.recurrenceRuleDaysOfWeek!)).toEqual(['MON', 'WED', 'FRI']);
    });

    it('handles empty checklist correctly', () => {
      const aggregate = createTestAggregate({ checklist: null });

      const persistence = PrismaTaskTemplateMapper.toPersistence(aggregate);

      expect(persistence.checklist).toBeNull();
    });

    it('handles null fields correctly', () => {
      const aggregate = createTestAggregate();

      const persistence = PrismaTaskTemplateMapper.toPersistence(aggregate);

      expect(persistence.description).toBeNull();
      expect(persistence.color).toBeNull();
      expect(persistence.timeConfigType).toBeNull();
      expect(persistence.goalId).toBeNull();
    });
  });

  describe('Round-trip: toDomain -> toPersistence', () => {
    it('preserves task template data integrity', () => {
      const originalRow = createFullRow();
      const aggregate = PrismaTaskTemplateMapper.toDomain(originalRow);
      const persistence = PrismaTaskTemplateMapper.toPersistence(aggregate);

      expect(persistence.name).toBe(originalRow.name);
      expect(persistence.description).toBe(originalRow.description);
      expect(persistence.importance).toBe(originalRow.importance);
      expect(persistence.status).toBe(originalRow.status);
      expect(persistence.version).toBe(originalRow.version);
    });
  });

  describe('toDomainList', () => {
    it('maps empty list', () => {
      const result = PrismaTaskTemplateMapper.toDomainList([]);
      expect(result).toEqual([]);
    });

    it('maps multiple rows preserving order', () => {
      const rows = [createMinimalRow(), createFullRow(), createMinimalRow()];
      const domains = PrismaTaskTemplateMapper.toDomainList(rows);

      expect(domains).toHaveLength(3);
      expect(domains[0].id).toBe(TEMPLATE_ID_1);
      expect(domains[1].id).toBe(TEMPLATE_ID_2);
      expect(domains[2].id).toBe(TEMPLATE_ID_1);
    });
  });
});
