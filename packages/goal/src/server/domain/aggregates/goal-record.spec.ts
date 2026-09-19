import { describe, expect, it } from 'vitest';
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
    ).toThrow('Value must be a valid number');
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
