import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { aTaskOccurrence, TASK_TEST_OCCURRENCE_PROJECTION } from '../../../../../testing';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { SkipTaskOccurrenceUseCase } from '../skip-task-occurrence.use-case';
import { createInlineTaskWriteTransactionRunner } from '../task-write-support';

describe('SkipTaskOccurrenceUseCase', () => {
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: SkipTaskOccurrenceUseCase;

  beforeEach(() => {
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new SkipTaskOccurrenceUseCase(
      instanceRepo,
      createInlineTaskWriteTransactionRunner({ occurrenceRepository: instanceRepo }),
      TASK_TEST_OCCURRENCE_PROJECTION,
    );
  });

  it('should return NOT_FOUND when occurrence does not exist', async () => {
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(instanceRepo.save).not.toHaveBeenCalled();
  });

  it('should skip a Pending occurrence without a reason', async () => {
    const occurrence = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(occurrence.id, occurrence.identityId);

    expect(result).toBeOk();
    expect(instanceRepo.save).toHaveBeenCalledWith(occurrence);
    expect(occurrence.status).toBe('Skipped');
  });

  it('should skip a Pending occurrence with a reason', async () => {
    const occurrence = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(occurrence.id, occurrence.identityId, { reason: 'Not today' });

    expect(result).toBeOk();
    expect(occurrence.status).toBe('Skipped');
  });

  it('should skip an InProgress occurrence', async () => {
    const occurrence = await aTaskOccurrence();
    occurrence.start();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(occurrence.id, occurrence.identityId, { reason: 'Changed plans' });

    expect(result).toBeOk();
    expect(occurrence.status).toBe('Skipped');
  });

  it('should return VALIDATION_ERROR when occurrence cannot be skipped', async () => {
    const occurrence = await aTaskOccurrence();
    occurrence.start();
    occurrence.complete();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(occurrence.id, occurrence.identityId);

    expect(result).toBeErrorWithCode('VALIDATION_ERROR');
    expect(instanceRepo.save).not.toHaveBeenCalled();
  });

  it('should return the occurrence client DTO in the response', async () => {
    const occurrence = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(occurrence.id, occurrence.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.occurrence).toBeDefined();
      expect(result.data.occurrence.id).toBe(occurrence.id);
    }
  });
});
