import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { aTaskOccurrence, anIdentityId, TASK_TEST_OCCURRENCE_PROJECTION } from '../../../../../testing';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { ListTaskOccurrencesByStatusUseCase } from '../list-task-occurrences-by-status.use-case';

describe('ListTaskOccurrencesByStatusUseCase', () => {
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: ListTaskOccurrencesByStatusUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByStatus: vi.fn().mockResolvedValue([]),
    });
    useCase = new ListTaskOccurrencesByStatusUseCase(instanceRepo, TASK_TEST_OCCURRENCE_PROJECTION);
  });

  it('should return empty array when no instances match', async () => {
    const result = await useCase.execute(anIdentityId(), 'Pending');

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
  });

  it('should return instance DTOs for matching status', async () => {
    const instance1 = await aTaskOccurrence();
    const instance2 = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByStatus).mockResolvedValue([instance1, instance2]);

    const result = await useCase.execute(anIdentityId(), 'Pending');

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe(instance1.id);
      expect(result.data[1].id).toBe(instance2.id);
    }
  });

  it('should pass identityId and status to repository', async () => {
    const identityId = anIdentityId();

    await useCase.execute(identityId, 'Completed');

    expect(instanceRepo.findByStatus).toHaveBeenCalledWith(identityId, 'Completed');
  });
});
