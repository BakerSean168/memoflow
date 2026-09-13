import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { aTaskOccurrence, TASK_TEST_OCCURRENCE_PROJECTION } from '../../../../../testing';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { UncompleteTaskOccurrenceUseCase } from '../uncomplete-task-occurrence.use-case';
import { createInlineTaskWriteTransactionRunner } from '../task-write-support';

describe('UncompleteTaskOccurrenceUseCase', () => {
  let occurrenceRepository: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: UncompleteTaskOccurrenceUseCase;

  beforeEach(() => {
    occurrenceRepository = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new UncompleteTaskOccurrenceUseCase(
      occurrenceRepository,
      createInlineTaskWriteTransactionRunner({ occurrenceRepository }),
      TASK_TEST_OCCURRENCE_PROJECTION,
    );
  });

  it('throws an error if transactionRunner is missing', () => {
    expect(
      () => new UncompleteTaskOccurrenceUseCase(occurrenceRepository, undefined as any),
    ).toThrow('TaskWriteTransactionRunner must be explicitly provided to UncompleteTaskOccurrenceUseCase');
  });

  it('returns a completed occurrence to Pending and saves it', async () => {
    const occurrence = await aTaskOccurrence();
    occurrence.complete();
    occurrence.pullDomainEvents();
    vi.mocked(occurrenceRepository.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(String(occurrence.id), String(occurrence.identityId));

    expect(result).toBeOk();
    expect(occurrence.status).toBe('Pending');
    expect(occurrenceRepository.save).toHaveBeenCalledWith(occurrence);
  });

  it('rejects an occurrence that is not completed', async () => {
    const occurrence = await aTaskOccurrence();
    vi.mocked(occurrenceRepository.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(String(occurrence.id), String(occurrence.identityId));

    expect(result).toBeErrorWithCode('VALIDATION_ERROR');
    expect(occurrenceRepository.save).not.toHaveBeenCalled();
  });
});
