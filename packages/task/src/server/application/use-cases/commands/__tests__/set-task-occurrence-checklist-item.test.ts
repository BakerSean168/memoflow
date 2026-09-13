import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { aTaskOccurrence, TASK_TEST_OCCURRENCE_PROJECTION } from '../../../../../testing';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { SetTaskOccurrenceChecklistItemUseCase } from '../set-task-occurrence-checklist-item.use-case';
import { createInlineTaskWriteTransactionRunner } from '../task-write-support';

describe('SetTaskOccurrenceChecklistItemUseCase', () => {
  let occurrenceRepository: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: SetTaskOccurrenceChecklistItemUseCase;

  beforeEach(() => {
    occurrenceRepository = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new SetTaskOccurrenceChecklistItemUseCase(
      occurrenceRepository,
      createInlineTaskWriteTransactionRunner({ instanceRepository: occurrenceRepository }),
      TASK_TEST_OCCURRENCE_PROJECTION,
    );
  });

  it('checks and unchecks an occurrence snapshot item without completing the occurrence', async () => {
    const occurrence = await aTaskOccurrence({
      checklistDefinition: [{ id: 'check-1', title: 'Prepare evidence', order: 0 }],
    });
    vi.mocked(occurrenceRepository.findByIdForIdentity).mockResolvedValue(occurrence);
    const initialVersion = occurrence.version;

    const checked = await useCase.execute(String(occurrence.id), String(occurrence.identityId), {
      definitionId: 'check-1',
      completed: true,
      expectedVersion: initialVersion,
    });

    expect(checked).toBeOk();
    expect(occurrence.status).toBe('Pending');
    expect(occurrence.checklistState[0]).toMatchObject({
      definitionId: 'check-1',
      completed: true,
    });
    expect(occurrence.version).toBe(initialVersion + 1);
    expect(occurrenceRepository.save).toHaveBeenCalledWith(occurrence);

    vi.mocked(occurrenceRepository.save).mockClear();
    const unchecked = await useCase.execute(String(occurrence.id), String(occurrence.identityId), {
      definitionId: 'check-1',
      completed: false,
      expectedVersion: occurrence.version,
    });

    expect(unchecked).toBeOk();
    expect(occurrence.status).toBe('Pending');
    expect(occurrence.checklistState[0]).toMatchObject({
      definitionId: 'check-1',
      completed: false,
      completedAt: null,
    });
    expect(occurrenceRepository.save).toHaveBeenCalledWith(occurrence);
  });

  it('fails closed on a stale expected version', async () => {
    const occurrence = await aTaskOccurrence({
      checklistDefinition: [{ id: 'check-1', title: 'Prepare evidence', order: 0 }],
    });
    vi.mocked(occurrenceRepository.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(String(occurrence.id), String(occurrence.identityId), {
      definitionId: 'check-1',
      completed: true,
      expectedVersion: occurrence.version + 1,
    });

    expect(result).toBeErrorWithCode('CONFLICT');
    expect(occurrenceRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a definition that is not in the occurrence snapshot', async () => {
    const occurrence = await aTaskOccurrence({ checklistDefinition: [] });
    vi.mocked(occurrenceRepository.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(String(occurrence.id), String(occurrence.identityId), {
      definitionId: 'missing',
      completed: true,
      expectedVersion: occurrence.version,
    });

    expect(result).toBeErrorWithCode('VALIDATION_ERROR');
    expect(occurrenceRepository.save).not.toHaveBeenCalled();
  });
});
