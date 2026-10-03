import { createTimeContext } from '@memoflow/time';
import { TaskOccurrenceProjectionService } from '../../../services/task-occurrence-projection.service';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import {
  aTaskOccurrence,
  anIdentityId,
  TASK_TEST_OCCURRENCE_PROJECTION,
} from '../../../../../testing';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { GetTaskOccurrencesByDateRangeUseCase } from '../get-task-occurrences-by-date-range.use-case';

describe('GetTaskOccurrencesByDateRangeUseCase', () => {
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: GetTaskOccurrencesByDateRangeUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByDateRange: vi.fn().mockResolvedValue([]),
      findOpenBeforeDate: vi.fn().mockResolvedValue([]),
    });
    useCase = new GetTaskOccurrencesByDateRangeUseCase(
      instanceRepo,
      TASK_TEST_OCCURRENCE_PROJECTION,
    );
  });

  it('should return empty data with total=0 when no occurrences in range', async () => {
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

  it('should return occurrence DTOs with correct total', async () => {
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

  it('optionally prepends open overdue facts without scanning future or terminal history', async () => {
    const overdue = await aTaskOccurrence();
    const inRange = await aTaskOccurrence();
    vi.mocked(instanceRepo.findOpenBeforeDate).mockResolvedValue([overdue]);
    vi.mocked(instanceRepo.findByDateRange).mockResolvedValue([inRange]);

    const result = await useCase.execute(
      anIdentityId(),
      Date.parse('2026-09-29T00:00:00.000Z'),
      Date.parse('2026-09-29T23:59:59.999Z'),
      true,
    );

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.data.map((item) => item.id)).toEqual([overdue.id, inRange.id]);
      expect(result.data.total).toBe(2);
    }
    expect(instanceRepo.findOpenBeforeDate).toHaveBeenCalledTimes(1);
  });

  it('uses the same Product Time date for Today and overdue across a DST boundary', async () => {
    const owner = anIdentityId();
    const getUserTimeContext = vi
      .fn()
      .mockResolvedValue(createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 1 }));
    const query = new GetTaskOccurrencesByDateRangeUseCase(
      instanceRepo,
      new TaskOccurrenceProjectionService({ getUserTimeContext }),
    );
    await query.execute(
      owner,
      Date.parse('2026-11-01T04:00:00Z'),
      Date.parse('2026-11-02T04:59:59.999Z'),
      true,
    );
    expect(getUserTimeContext).toHaveBeenCalledWith(owner);
    expect(instanceRepo.findByDateRange).toHaveBeenCalledWith(owner, '2026-11-01', '2026-11-01');
    expect(instanceRepo.findOpenBeforeDate).toHaveBeenCalledWith(owner, '2026-11-01');
  });

  it('does not query overdue facts for normal bounded range reads', async () => {
    await useCase.execute(anIdentityId(), 1000, 2000);
    expect(instanceRepo.findOpenBeforeDate).not.toHaveBeenCalled();
  });

  it('should pass all parameters to repository', async () => {
    const identityId = anIdentityId();
    const startDate = 1000;
    const endDate = 2000;

    await useCase.execute(identityId, startDate, endDate);

    expect(instanceRepo.findByDateRange).toHaveBeenCalledWith(
      identityId,
      '1970-01-01',
      '1970-01-01',
    );
  });
});
