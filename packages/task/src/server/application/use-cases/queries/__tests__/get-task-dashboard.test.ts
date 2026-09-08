import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { GetTaskDashboardUseCase } from '../get-task-dashboard.use-case';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { aOneTimeTask, aTaskOccurrence, anIdentityId } from '../../../../../testing';
import { TaskPlanStatus } from '@memoflow/contracts/task';

const NOW = new Date('2026-09-08T12:00:00+08:00').getTime();

describe('GetTaskDashboardUseCase', () => {
  let planRepo: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let occurrenceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: GetTaskDashboardUseCase;
  const identityId = anIdentityId();

  beforeEach(() => {
    planRepo = createMockRepo<ITaskPlanRepository>({
      findActiveTemplates: vi.fn().mockResolvedValue([]),
      countTasks: vi.fn().mockResolvedValue(0),
    });
    occurrenceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByDateRange: vi.fn().mockResolvedValue([]),
      findOverdueInstances: vi.fn().mockResolvedValue([]),
    });
    useCase = new GetTaskDashboardUseCase(planRepo, occurrenceRepo, () => NOW);
  });

  it('reads today/upcoming/overdue from occurrence truth, not plan due state', async () => {
    const result = await useCase.execute(identityId);

    expect(result).toBeOk();
    expect(occurrenceRepo.findByDateRange).toHaveBeenCalledTimes(2);
    expect(occurrenceRepo.findOverdueInstances).toHaveBeenCalledWith(identityId);
    expect(planRepo.countTasks).toHaveBeenCalledWith(identityId, { status: TaskPlanStatus.Active });
    expect(planRepo.countTasks).toHaveBeenCalledWith(identityId, { status: TaskPlanStatus.Closed });
  });

  it('returns occurrence DTOs for today and overdue', async () => {
    const today = await aTaskOccurrence({ identityId, instanceDate: NOW });
    const overdue = await aTaskOccurrence({ identityId, instanceDate: NOW - 86_400_000 });
    vi.mocked(occurrenceRepo.findByDateRange)
      .mockResolvedValueOnce([today])
      .mockResolvedValueOnce([]);
    vi.mocked(occurrenceRepo.findOverdueInstances).mockResolvedValue([overdue]);

    const result = await useCase.execute(identityId);
    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.todayTasks[0]?.id).toBe(String(today.id));
      expect(result.data.overdueTasks[0]?.id).toBe(String(overdue.id));
      expect(result.data.summary.overdue).toBe(1);
    }
  });

  it('counts actual completed occurrences for completedToday', async () => {
    const completed = await aTaskOccurrence({ identityId, instanceDate: NOW });
    completed.complete();
    vi.mocked(occurrenceRepo.findByDateRange)
      .mockResolvedValueOnce([completed])
      .mockResolvedValueOnce([]);

    const result = await useCase.execute(identityId);
    expect(result).toBeOk();
    if (result.ok) expect(result.data.summary.completedToday).toBe(1);
  });

  it('keeps high-priority ranking plan-owned', async () => {
    const high = aOneTimeTask({ identityId, title: 'High', importance: 'Vital', startDate: NOW });
    const low = aOneTimeTask({ identityId, title: 'Low', importance: 'Minor', startDate: NOW });
    vi.mocked(planRepo.findActiveTemplates).mockResolvedValue([low, high]);

    const result = await useCase.execute(identityId);
    expect(result).toBeOk();
    if (result.ok) expect(result.data.highPriorityTasks[0]?.name).toBe('High');
  });

  it('counts active and closed plans without treating closed as completed-today', async () => {
    vi.mocked(planRepo.countTasks).mockResolvedValueOnce(10).mockResolvedValueOnce(5);
    const result = await useCase.execute(identityId);
    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.summary.totalTasks).toBe(15);
      expect(result.data.summary.completedToday).toBe(0);
    }
  });
});
