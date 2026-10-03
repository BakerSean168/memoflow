import { describe, expect, it } from 'vitest';
import { GoalRecordAuthorship, GoalRecordAuthorshipSchema } from '../entities/goal-record-server';
import { GoalRecordClientDTOSchema } from './response-schemas';
import { CreateGoalRecordSchema } from './goal-record.dto';
import { createMockGoalRecord } from '../../../mocks/goal.mock';

describe('GoalRecord provenance contract', () => {
  it('freezes exactly three persisted authorship values', () => {
    expect(Object.values(GoalRecordAuthorship)).toEqual(['Manual', 'TaskAutomatic', 'TaskUserMeasurement']);
    for (const authorship of Object.values(GoalRecordAuthorship))
      expect(GoalRecordAuthorshipSchema.parse(authorship)).toBe(authorship);
    expect(GoalRecordAuthorshipSchema.safeParse('TASK_INSTANCE').success).toBe(false);
  });
  it.each(Object.values(GoalRecordAuthorship))('preserves %s provenance and semantic timestamp', (authorship) => {
    const dto = createMockGoalRecord({ authorship, recordedAt: 1000, createdAt: 2000,
      source: authorship === 'Manual' ? null : { type: 'TASK_INSTANCE', id: 'task-source' } });
    expect(GoalRecordClientDTOSchema.parse(dto)).toEqual(dto);
    const { recordedAt: _recordedAt, ...missing } = dto;
    expect(GoalRecordClientDTOSchema.safeParse(missing).success).toBe(false);
  });
  it('public creation cannot select authorship or source', () => {
    const dto = createMockGoalRecord();
    const input = { keyResultId: dto.keyResultId, value: 2, note: 'manual', expectedVersion: 1 };
    expect(CreateGoalRecordSchema.parse({ ...input, authorship: 'TaskAutomatic',
      source: { type: 'TASK_INSTANCE', id: 'forged' }, sourceType: 'TASK_INSTANCE', sourceId: 'forged' })).toEqual(input);
  });
});
