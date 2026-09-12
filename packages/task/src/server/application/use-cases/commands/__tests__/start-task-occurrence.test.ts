import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import {
  aTaskOccurrence,
  TASK_TEST_OCCURRENCE_PROJECTION,
  TASK_TEST_TIME_CONTEXT,
} from '../../../../../testing';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { StartTaskOccurrenceUseCase } from '../start-task-occurrence.use-case';

describe('StartTaskOccurrenceUseCase', () => {
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: StartTaskOccurrenceUseCase;

  beforeEach(() => {
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new StartTaskOccurrenceUseCase(instanceRepo, TASK_TEST_OCCURRENCE_PROJECTION);
  });

  it('should return NOT_FOUND when instance does not exist', async () => {
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(instanceRepo.save).not.toHaveBeenCalled();
  });

  it('should start a Pending instance and return ok', async () => {
    const instance = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(instance.id, instance.identityId);

    expect(result).toBeOk();
    expect(instanceRepo.save).toHaveBeenCalledWith(instance);
    expect(instance.status).toBe('InProgress');
  });

  it('should return VALIDATION_ERROR when instance cannot be started', async () => {
    // Create and complete an instance so it can't be started
    const instance = await aTaskOccurrence();
    instance.start();
    instance.complete();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(instance.id, instance.identityId);

    expect(result).toBeErrorWithCode('VALIDATION_ERROR');
    expect(instanceRepo.save).not.toHaveBeenCalled();
  });

  it('should return the instance client DTO on success', async () => {
    const instance = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(instance.id, instance.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toEqual(instance.toClientDTOAt(TASK_TEST_TIME_CONTEXT));
    }
  });
});
