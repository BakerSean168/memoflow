import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { aTaskOccurrence, anIdentityId, TASK_TEST_OCCURRENCE_PROJECTION } from '../../../../../testing';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { GetTaskOccurrencesByDateRangeUseCase } from '../get-task-occurrences-by-date-range.use-case';

describe('GetTaskOccurrencesByDateRangeUseCase', () => {
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: GetTaskOccurrencesByDateRangeUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByDateRange: vi.fn().mockResolvedValue([]),
    });
    useCase = new GetTaskOccurrencesByDateRangeUseCase(instanceRepo, TASK_TEST_OCCURRENCE_PROJECTION);
  });

  it('should return empty data with total=0 when no instances in range', async () => {
    const identityId = anIdentityId();
    const startDate = Date.now();
    const endDate = startDate + 86400000;

    const result = await useCase.execute(identityId, startDate, endDate);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.data).toEqual([]);
      expect(result.data.total).toBe(0);
    }
  });

  it('should return instance DTOs with correct total', async () => {
    const instance1 = await aTaskOccurrence();
    const instance2 = await aTaskOccurrence();
    const instance3 = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByDateRange).mockResolvedValue([instance1, instance2, instance3]);

    const result = await useCase.execute(anIdentityId(), 0, Date.now());

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.data).toHaveLength(3);
      expect(result.data.total).toBe(3);
      expect(result.data.data[0].id).toBe(instance1.id);
    }
  });

  it('should pass all parameters to repository', async () => {
    const identityId = anIdentityId();
    const startDate = 1000;
    const endDate = 2000;

    await useCase.execute(identityId, startDate, endDate);

    expect(instanceRepo.findByDateRange).toHaveBeenCalledWith(identityId, startDate, endDate);
  });
});
