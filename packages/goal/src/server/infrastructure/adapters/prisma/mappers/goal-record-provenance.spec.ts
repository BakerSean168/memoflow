import { describe, expect, it, vi } from 'vitest';
import type { GoalRecord as PrismaRecord } from '@memoflow/database';
import { aPrefixedUuid } from '@memoflow/test-utils/fixtures';
import { GoalRecord } from '../../../../domain';
import { PrismaGoalRecordMapper } from './prisma-goal-record-mapper';
import { GoalRecordPrismaRepository } from '../goal-record-prisma.repository';
import { PowerSyncGoalRecordMapper } from '../../powersync/mappers/powersync-goal-record.mapper';
import { GoalRecordPowerSyncRepository } from '../../powersync/goal-record-powersync.repository';

const cases = [
  { authorship: 'Manual', source: undefined },
  { authorship: 'TaskAutomatic', source: { type: 'TASK_INSTANCE', id: 'occurrence' } },
  { authorship: 'TaskAutomatic', source: { type: 'TASK_TEMPLATE', id: 'plan' } },
  { authorship: 'TaskUserMeasurement', source: { type: 'TASK_INSTANCE', id: 'occurrence' } },
] as const;

describe('GoalRecord persistence provenance round trips', () => {
  it.each(cases)('round trips $authorship / $source through Prisma create and update', async ({ authorship, source }) => {
    const record = GoalRecord.create({
      id: aPrefixedUuid('IGoalRecordId', 'provenance') as never,
      keyResultId: aPrefixedUuid('IKeyResultId', 'provenance') as never,
      identityId: aPrefixedUuid('IdentityId', 'provenance') as never,
      value: 3, note: 'measurement', authorship, source, recordedAt: 1000,
    });
    const upsert = vi.fn();
    await new GoalRecordPrismaRepository({ goalRecord: { upsert } } as never).save(record);
    const write = upsert.mock.calls[0]![0];
    const loaded = PrismaGoalRecordMapper.toDomain(write.create as PrismaRecord);
    expect(loaded.toServerDTO()).toEqual(record.toServerDTO());
    expect(write.update).toMatchObject({ authorship, sourceType: source?.type ?? null, sourceId: source?.id ?? null });
  });

  it.each(cases)('round trips $authorship / $source through PowerSync insert and update', async ({ authorship, source }) => {
    const record = GoalRecord.create({
      id: aPrefixedUuid('IGoalRecordId', 'provenance') as never,
      keyResultId: aPrefixedUuid('IKeyResultId', 'provenance') as never,
      identityId: aPrefixedUuid('IdentityId', 'provenance') as never,
      value: 3, note: 'measurement', authorship, source, recordedAt: 1000,
    });
    const execute = vi.fn();
    const getOptional = vi.fn().mockResolvedValue(null);
    const repository = new GoalRecordPowerSyncRepository({ execute, getOptional } as never);
    await repository.save(record);
    const [sql, values] = execute.mock.calls[0]!;
    const columns = sql.match(/INSERT INTO goal_records \(([\s\S]+?)\)/)[1].split(',').map((s: string) => s.trim());
    const row = Object.fromEntries(columns.map((name: string, i: number) => [name, values[i]]));
    const loaded = PowerSyncGoalRecordMapper.toDomain(row);
    expect(loaded.toServerDTO()).toEqual(record.toServerDTO());
    getOptional.mockResolvedValue({ id: record.id });
    await repository.save(record);
    const [updateSql, updateValues] = execute.mock.calls[1]!;
    const updateColumns = updateSql.match(/SET ([\s\S]+?)WHERE/)[1].split(',').map((s: string) => s.trim().split(' ')[0]);
    const updatedRow = { ...row, ...Object.fromEntries(updateColumns.map((name: string, i: number) => [name, updateValues[i]])) };
    expect(PowerSyncGoalRecordMapper.toDomain(updatedRow).toServerDTO()).toEqual(record.toServerDTO());
  });

  it('rejects invalid persisted provenance in both adapters', () => {
    const row = { id: aPrefixedUuid('IGoalRecordId', 'bad-provenance'),
      keyResultId: aPrefixedUuid('IKeyResultId', 'bad-provenance'), identityId: aPrefixedUuid('IdentityId', 'bad-provenance'),
      value: 3, note: null, authorship: 'TaskUserMeasurement', sourceType: 'TASK_TEMPLATE', sourceId: 'plan',
      recordedAt: new Date(1000), createdAt: new Date(2000), updatedAt: new Date(2000) };
    expect(() => PrismaGoalRecordMapper.toDomain(row as PrismaRecord)).toThrow();
    expect(() => PowerSyncGoalRecordMapper.toDomain({ id: row.id, key_result_id: row.keyResultId, identity_id: row.identityId,
      authorship: row.authorship, source_type: row.sourceType, source_id: row.sourceId })).toThrow();
  });
});
