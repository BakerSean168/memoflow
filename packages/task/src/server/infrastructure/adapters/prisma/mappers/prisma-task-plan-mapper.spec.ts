import { describe, expect, it } from 'vitest';
import { aPrefixedUuid } from '@memoflow/test-utils/fixtures';
import type { TaskPlan as PrismaTaskPlan } from '@memoflow/database';
import { PrismaTaskPlanMapper } from './prisma-task-plan-mapper';

const TEMPLATE_ID = aPrefixedUuid('ITaskPlanId', 'task-plan-canonical');
const IDENTITY_ID = aPrefixedUuid('IdentityId', 'task-plan-owner');
const GOAL_ID = aPrefixedUuid('GoalId', 'goal');
const KEY_RESULT_ID = aPrefixedUuid('KeyResultId', 'key-result');

const oneTimeSchedule = {
  kind: 'OneTime',
  date: '2026-09-13',
  timing: { kind: 'AllDay' },
} as const;

const recurringSchedule = {
  kind: 'Recurring',
  startDate: '2026-09-14',
  timing: { kind: 'Window', start: '09:00', end: '17:00' },
  recurrence: {
    frequency: 'Weekly',
    interval: 1,
    byWeekday: [1, 3],
    end: { kind: 'Count', count: 8 },
  },
} as const;

const reminderConfig = {
  enabled: true,
  triggers: [
    {
      type: 'Relative',
      absoluteTime: null,
      relativeValue: 15,
      relativeUnit: 'Minutes',
    },
    {
      type: 'Relative',
      absoluteTime: null,
      relativeValue: 1,
      relativeUnit: 'Hours',
    },
  ],
} as const;

function minimalRow(overrides: Partial<PrismaTaskPlan> = {}): PrismaTaskPlan {
  return {
    id: TEMPLATE_ID,
    identityId: IDENTITY_ID,
    name: 'Canonical Task',
    description: null,
    status: 'Active',
    outcome: 'Open',
    completionPolicy: 'AllowCorrection',
    closedAt: null,
    archivedAt: null,
    abandonedReason: null,
    importance: 'Moderate',
    schedule: oneTimeSchedule,
    reminderConfig: null,
    goalId: null,
    keyResultId: null,
    goalRecordValue: null,
    goalProgressTrigger: null,
    checklist: null,
    version: 1,
    createdAt: new Date('2026-09-13T00:00:00.000Z'),
    updatedAt: new Date('2026-09-13T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  } as PrismaTaskPlan;
}

describe('PrismaTaskPlanMapper canonical persistence', () => {
  it('hydrates a one-time canonical schedule directly from Prisma JSON', () => {
    const plan = PrismaTaskPlanMapper.toDomain(minimalRow());
    expect(plan.schedule.toDTO()).toEqual(oneTimeSchedule);
    expect(plan.reminderConfig).toBeNull();
  });

  it('hydrates a recurring schedule without flattened recurrence columns', () => {
    const plan = PrismaTaskPlanMapper.toDomain(minimalRow({ schedule: recurringSchedule }));
    expect(plan.schedule.toDTO()).toEqual(recurringSchedule);
    expect(plan.schedule.isRecurring).toBe(true);
  });

  it('round-trips the full multi-trigger reminder config as one JSON value', () => {
    const row = minimalRow({ reminderConfig: JSON.stringify(reminderConfig) });
    const plan = PrismaTaskPlanMapper.toDomain(row);
    expect(plan.reminderConfig?.toDTO()).toEqual(reminderConfig);
    expect(PrismaTaskPlanMapper.toPersistence(plan).reminderConfig).toBe(
      JSON.stringify(reminderConfig),
    );
  });

  it('round-trips stable checklist definition identities', () => {
    const checklist = [
      { id: 'check-a', title: 'First', order: 0 },
      { id: 'check-b', title: 'Second', order: 1 },
    ];
    const plan = PrismaTaskPlanMapper.toDomain(
      minimalRow({ checklist: JSON.stringify(checklist) }),
    );
    expect(plan.checklist.map((item) => item.toDTO())).toEqual(checklist);
    expect(JSON.parse(PrismaTaskPlanMapper.toPersistence(plan).checklist ?? '[]')).toEqual(
      checklist,
    );
  });

  it('round-trips Goal/KR contribution relation columns', () => {
    const plan = PrismaTaskPlanMapper.toDomain(
      minimalRow({
        goalId: GOAL_ID,
        keyResultId: KEY_RESULT_ID,
        goalRecordValue: 2,
        goalProgressTrigger: 'EachCompletion',
      }),
    );
    expect(plan.goalBinding?.toDTO()).toEqual({
      goalId: GOAL_ID,
      keyResultId: KEY_RESULT_ID,
      contribution: { value: 2, trigger: 'EachCompletion' },
    });
    expect(PrismaTaskPlanMapper.toPersistence(plan)).toMatchObject({
      goalId: GOAL_ID,
      keyResultId: KEY_RESULT_ID,
      goalRecordValue: 2,
      goalProgressTrigger: 'EachCompletion',
    });
  });

  it('preserves lifecycle/audit fields', () => {
    const closedAt = new Date('2026-09-20T10:00:00.000Z');
    const archivedAt = new Date('2026-09-21T10:00:00.000Z');
    const deletedAt = new Date('2026-09-22T10:00:00.000Z');
    const plan = PrismaTaskPlanMapper.toDomain(
      minimalRow({
        status: 'Closed',
        outcome: 'Abandoned',
        completionPolicy: 'StrictNoBackfill',
        closedAt,
        archivedAt,
        abandonedReason: 'stopped',
        deletedAt,
        version: 7,
      }),
    );
    expect(plan.toServerDTO()).toMatchObject({
      status: 'Closed',
      outcome: 'Abandoned',
      completionPolicy: 'StrictNoBackfill',
      closedAt: closedAt.getTime(),
      archivedAt: archivedAt.getTime(),
      abandonedReason: 'stopped',
      deletedAt: deletedAt.getTime(),
      version: 7,
    });
  });

  it('writes only canonical scheduling/reminder properties', () => {
    const plan = PrismaTaskPlanMapper.toDomain(
      minimalRow({ schedule: recurringSchedule, reminderConfig: JSON.stringify(reminderConfig) }),
    );
    const persistence = PrismaTaskPlanMapper.toPersistence(plan) as Record<string, unknown>;
    expect(persistence.schedule).toEqual(recurringSchedule);
    expect(persistence.reminderConfig).toBe(JSON.stringify(reminderConfig));
    for (const legacy of [
      'timeConfigType',
      'timeConfigStartTime',
      'recurrenceRuleType',
      'recurrenceRuleInterval',
      'reminderConfigEnabled',
      'lastGeneratedDate',
      'generateAheadDays',
    ]) {
      expect(persistence).not.toHaveProperty(legacy);
    }
  });

  it('maps lists without changing order', () => {
    const secondId = aPrefixedUuid('ITaskPlanId', 'task-plan-second');
    const rows = [minimalRow(), minimalRow({ id: secondId, name: 'Second' })];
    expect(PrismaTaskPlanMapper.toDomainList(rows).map((plan) => plan.id)).toEqual([
      TEMPLATE_ID,
      secondId,
    ]);
  });

  it('fails closed when canonical schedule JSON is absent or malformed', () => {
    expect(() =>
      PrismaTaskPlanMapper.toDomain({ ...minimalRow(), schedule: undefined } as never),
    ).toThrow();
    expect(() =>
      PrismaTaskPlanMapper.toDomain({ ...minimalRow(), schedule: { kind: 'Legacy' } } as never),
    ).toThrow();
  });

  it('fails closed when reminder JSON is invalid instead of flattening a fallback', () => {
    expect(() =>
      PrismaTaskPlanMapper.toDomain(minimalRow({ reminderConfig: '{not-json' })),
    ).toThrow();
  });
});
