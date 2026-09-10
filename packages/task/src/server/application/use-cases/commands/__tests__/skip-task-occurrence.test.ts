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
      createInlineTaskWriteTransactionRunner({ instanceRepository: instanceRepo }),
      TASK_TEST_OCCURRENCE_PROJECTION,
    );
  });

  it('should return NOT_FOUND when instance does not exist', async () => {
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(instanceRepo.save).not.toHaveBeenCalled();
  });

  it('should skip a Pending instance without a reason', async () => {
    const instance = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(instance.id, instance.identityId);

    expect(result).toBeOk();
    expect(instanceRepo.save).toHaveBeenCalledWith(instance);
    expect(instance.status).toBe('Skipped');
  });

  it('should skip a Pending instance with a reason', async () => {
    const instance = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(instance.id, instance.identityId, { reason: 'Not today' });

    expect(result).toBeOk();
    expect(instance.status).toBe('Skipped');
  });

  it('should skip an InProgress instance', async () => {
    const instance = await aTaskOccurrence();
    instance.start();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(instance.id, instance.identityId, { reason: 'Changed plans' });

    expect(result).toBeOk();
    expect(instance.status).toBe('Skipped');
  });

  it('should return VALIDATION_ERROR when instance cannot be skipped', async () => {
    const instance = await aTaskOccurrence();
    instance.start();
    instance.complete();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(instance.id, instance.identityId);

    expect(result).toBeErrorWithCode('VALIDATION_ERROR');
    expect(instanceRepo.save).not.toHaveBeenCalled();
  });

  it('should return the instance client DTO in the response', async () => {
    const instance = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(instance.id, instance.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.instance).toBeDefined();
      expect(result.data.instance.id).toBe(instance.id);
    }
  });
});
