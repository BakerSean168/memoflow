import { describe, expect, it } from 'vitest';
import { CreateGoalRecordSchema, UpdateGoalRecordSchema } from '@memoflow/contracts/goal';
import { GoalRecord } from './goal-record';

describe('GoalRecord owned entity', () => {
  it('creates records and validates required fields', () => {
    const recordedAt = new Date('2026-04-26T09:00:00.000Z').getTime();
    const record = GoalRecord.create({
      id: 'GoalRecordId_1' as never,
      keyResultId: 'KeyResultId_1' as never,
      identityId: 'IdentityId_1' as never,
      value: 12,
      note: '  progress  ',
      recordedAt,
    });

    expect(record.value).toBe(12);
    expect(record.note).toBe('progress');
    expect(record.recordedAt).toBe(recordedAt);
    expect(record.toServerDTO()).toMatchObject({
      keyResultId: 'KeyResultId_1',
      value: 12,
      note: 'progress',
    });
    expect(record.toClientDTO('GoalId_1', 20)).toMatchObject({
      goalId: 'GoalId_1',
      value: 12,
      valueAfter: 20,
      comment: 'progress',
    });

    expect(() =>
      GoalRecord.create({
        keyResultId: '' as never,
        identityId: 'IdentityId_1' as never,
        value: 1,
      }),
    ).toThrow('KeyResult ID is required');
    expect(() =>
      GoalRecord.create({
        keyResultId: 'KeyResultId_1' as never,
        identityId: 'IdentityId_1' as never,
        value: Number.NaN,
      }),
    ).toThrow('Value must be a finite number');
  });

  it('updates notes and loads state without a child concurrency lifecycle', () => {
    const record = GoalRecord.create({
      keyResultId: 'KeyResultId_1' as never,
      identityId: 'IdentityId_1' as never,
      value: 12,
    });

    record.updateNote('  revised  ');
    expect(record.note).toBe('revised');

    const loaded = GoalRecord.load({
      id: 'GoalRecordId_2' as never,
      keyResultId: 'KeyResultId_2' as never,
      identityId: 'IdentityId_2' as never,
      value: 99,
      authorship: 'Manual',
      note: null,
      recordedAt: new Date('2026-04-26T10:00:00.000Z').getTime(),
      createdAt: new Date('2026-04-26T10:00:00.000Z'),
      updatedAt: new Date('2026-04-26T10:05:00.000Z'),
    });
    expect(loaded.value).toBe(99);
    expect(loaded.toClientDTO('GoalId_2').valueAfter).toBe(99);
  });

  it('preserves the task contribution source used for idempotency', () => {
    const record = GoalRecord.create({
      keyResultId: 'KeyResultId_1' as never,
      identityId: 'IdentityId_1' as never,
      value: 3,
      authorship: 'TaskAutomatic' as const,
      source: { type: 'TASK_INSTANCE', id: 'task-occurrence-1' },
    });

    expect(record.sourceType).toBe('TASK_INSTANCE');
    expect(record.sourceId).toBe('task-occurrence-1');
    expect(record.toServerDTO()).toMatchObject({
      sourceType: 'TASK_INSTANCE',
      sourceId: 'task-occurrence-1',
    });
  });
});

describe('manual GoalRecord finite-number contract', () => {
  const params = {
    keyResultId: '550e8400-e29b-41d4-a716-446655440000' as never,
    identityId: 'IdentityId_1' as never,
    value: 0,
  };
  it.each([-5, 0, 10001.125])('accepts signed finite value %s in create and update', (value) => {
    expect(CreateGoalRecordSchema.safeParse({ ...params, value, expectedVersion: 1 }).success).toBe(
      true,
    );
    expect(UpdateGoalRecordSchema.safeParse({ value, expectedVersion: 1 }).success).toBe(true);
    const record = GoalRecord.create({ ...params, value });
    expect(record.value).toBe(value);
    record.updateValue(value);
    expect(record.value).toBe(value);
  });
  it.each([NaN, Infinity, -Infinity])('rejects %s in the shared schemas and domain', (value) => {
    expect(CreateGoalRecordSchema.safeParse({ ...params, value, expectedVersion: 1 }).success).toBe(
      false,
    );
    expect(UpdateGoalRecordSchema.safeParse({ value, expectedVersion: 1 }).success).toBe(false);
    expect(() => GoalRecord.create({ ...params, value })).toThrow('Value must be a finite number');
    const record = GoalRecord.create(params);
    expect(() => record.updateValue(value)).toThrow('Value must be a finite number');
    expect(record.value).toBe(0);
  });
});

describe('GoalRecord authorship/source invariants', () => {
  const base = { keyResultId: 'KeyResultId_1' as never, identityId: 'IdentityId_1' as never, value: 3 };
  const sources = [null, 'TASK_INSTANCE', 'TASK_TEMPLATE'] as const;
  const authorships = ['Manual', 'TaskAutomatic', 'TaskUserMeasurement'] as const;
  for (const authorship of authorships) {
    for (const sourceType of sources) {
      for (const sourceId of [null, '', '  ', 'task-source-1']) {
        it(`${authorship}: source ${sourceType}/${JSON.stringify(sourceId)}`, () => {
          const valid = authorship === 'Manual'
            ? sourceType === null && sourceId === null
            : sourceId === 'task-source-1' && (authorship === 'TaskAutomatic'
              ? sourceType !== null : sourceType === 'TASK_INSTANCE');
          const state = {
            ...base, id: 'GoalRecordId_1' as never, note: null, authorship, sourceType, sourceId,
            recordedAt: 1000, createdAt: 2000, updatedAt: 2000,
          };
          if (!valid) {
            expect(() => GoalRecord.load(state)).toThrow();
            return;
          }
          const loaded = GoalRecord.load(state);
          const created = GoalRecord.create({ ...base, authorship,
            source: sourceType ? { type: sourceType, id: sourceId! } : undefined });
          expect(loaded.authorship).toBe(authorship);
          expect(created.authorship).toBe(authorship);
          expect(loaded.canUserCorrect).toBe(authorship !== 'TaskAutomatic');
          expect(loaded.canUserDelete).toBe(authorship === 'Manual');
          expect(loaded.toClientDTO('GoalId_1')).toMatchObject({
            authorship, recordedAt: 1000,
            source: sourceType ? { type: sourceType, id: sourceId } : null,
          });
          if (authorship === 'TaskAutomatic') {
            expect(() => loaded.updateValue(4)).toThrow();
            expect(() => loaded.updateNote('edited')).toThrow();
          }
        });
      }
    }
  }
  it('rejects unknown persisted authorship and source types', () => {
    expect(() => GoalRecord.validateProvenance('Unknown' as never, null, null)).toThrow();
    expect(() => GoalRecord.validateProvenance('TaskAutomatic', 'Unknown' as never, 'task')).toThrow();
  });
});
