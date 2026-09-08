import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { aTaskOccurrence } from '../../../../../testing';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { UncompleteTaskOccurrenceUseCase } from '../uncomplete-task-occurrence.use-case';
import { createInlineTaskWriteTransactionRunner } from '../task-write-support';

describe('UncompleteTaskOccurrenceUseCase', () => {
  let instanceRepository: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: UncompleteTaskOccurrenceUseCase;

  beforeEach(() => {
    instanceRepository = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new UncompleteTaskOccurrenceUseCase(
      instanceRepository,
      createInlineTaskWriteTransactionRunner({ instanceRepository }),
    );
  });

  it('throws an error if transactionRunner is missing', () => {
    expect(
      () => new UncompleteTaskOccurrenceUseCase(instanceRepository, undefined as any),
    ).toThrow('TaskWriteTransactionRunner must be explicitly provided to UncompleteTaskOccurrenceUseCase');
  });

  it('returns a completed instance to Pending and saves it', async () => {
    const instance = await aTaskOccurrence();
    instance.complete();
    instance.pullDomainEvents();
    vi.mocked(instanceRepository.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(String(instance.id), String(instance.identityId));

    expect(result).toBeOk();
    expect(instance.status).toBe('Pending');
    expect(instanceRepository.save).toHaveBeenCalledWith(instance);
  });

  it('rejects an instance that is not completed', async () => {
    const instance = await aTaskOccurrence();
    vi.mocked(instanceRepository.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(String(instance.id), String(instance.identityId));

    expect(result).toBeErrorWithCode('VALIDATION_ERROR');
    expect(instanceRepository.save).not.toHaveBeenCalled();
  });
});
