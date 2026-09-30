import { expect, it, vi } from 'vitest';
import { aPrefixedUuid } from '@memoflow/test-utils/fixtures';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { PortableReferenceV3 } from '@memoflow/contracts/data-portability';
import { Goal, GoalPolicy, GoalRecord, type IGoalRepository, type IGoalRecordRepository } from '../../../../domain';
import { CreateGoalUseCase } from '../create-goal.use-case';
import { createInlineGoalWriteTransactionRunner } from '../goal-write-support';
import { InMemoryGoalReliableOperationAdapter } from '../../../../infrastructure/adapters/in-memory/in-memory-goal-reliable-operation.adapter';
import { GoalPortableCapability } from '../../../goal-portability';

it.each(['TaskAutomatic', 'TaskUserMeasurement'] as const)('exports %s source-neutrally and restores Manual', async (authorship) => {
  const identityId = aPrefixedUuid('IdentityId', 'portable-provenance');
  const goal = Goal.create({ identityId: identityId as never, name: 'Portable measurements', summary: null, start: null, target: null, reminderConfig: null });
  const kr = goal.createAndAddKeyResult({ title: 'Distance', aggregationMethod: 'Sum', initialValue: 0, currentValue: 10, targetValue: 100, weight: 1, unit: 'km' });
  const record = GoalRecord.create({ keyResultId: kr.id, identityId: goal.identityId,
    value: 3, note: 'measurement', authorship, source: { type: 'TASK_INSTANCE', id: 'private-source-id' }, recordedAt: 1000 });
  const goalRepository = createMockRepo<IGoalRepository>({
    findByIdentityId: vi.fn().mockResolvedValue([goal]),
    findByIdForIdentity: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
  });
  const goalRecordRepository = createMockRepo<IGoalRecordRepository>({
    findByGoalId: vi.fn().mockResolvedValue([record]), save: vi.fn().mockResolvedValue(undefined),
  });
  const port = new CreateGoalUseCase(goalRepository, new GoalPolicy(),
    createInlineGoalWriteTransactionRunner({ goalRepository, goalRecordRepository }, new InMemoryGoalReliableOperationAdapter()), goalRecordRepository);
  const refs = new Map<string, PortableReferenceV3>();
  const exported = await new GoalPortableCapability({} as never, port).export({ identityId, batchId: 'batch', references: {
    declareExportReference: (_capability, id) => { const ref = `goals:${refs.size + 1}` as PortableReferenceV3; refs.set(id, ref); return ref; },
    resolveExportReference: (_capability, id) => refs.get(id)!,
    bindImportedReference: () => undefined,
    resolveImportedReference: () => undefined,
  } });
  const portable = exported.goals[0]!.records[0]!;
  expect(portable).toMatchObject({ value: 3, note: 'measurement', recordedAt: 1000 });
  for (const field of ['authorship', 'source', 'sourceType', 'sourceId']) expect(portable).not.toHaveProperty(field);
  expect(JSON.stringify(exported)).not.toContain('private-source-id');
  const restoredKrId = aPrefixedUuid('IKeyResultId', 'restored-provenance') as never;
  const result = await port.restoreGoalForPortability({
    name: 'Restored measurements', initialKeyResults: [{ id: restoredKrId, title: 'Distance',
      calculationMethod: 'Sum', initialValue: 0, currentValue: 13, trackingBaseValue: 10, targetValue: 100, weight: 1 }],
    records: [{ id: aPrefixedUuid('IGoalRecordId', 'restored-provenance') as never, keyResultId: restoredKrId,
      value: portable.value, note: portable.note, sourceType: null, sourceId: null,
      recordedAt: portable.recordedAt, createdAt: portable.recordedAt, updatedAt: portable.recordedAt }], reviews: [],
  }, { identityId });
  expect(result.ok).toBe(true);
  const restored = vi.mocked(goalRecordRepository.save).mock.calls[0]![0];
  expect(restored.toServerDTO()).toMatchObject({ authorship: 'Manual', sourceType: null, sourceId: null, recordedAt: 1000, value: 3 });
  expect(restored.canUserCorrect).toBe(true);
  expect(restored.canUserDelete).toBe(true);
});
