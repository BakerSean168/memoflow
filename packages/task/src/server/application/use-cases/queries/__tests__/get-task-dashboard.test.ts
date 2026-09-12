import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { GetTaskDashboardUseCase } from '../get-task-dashboard.use-case';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import {
  aOneTimeTask,
  aTaskOccurrence,
  aTimePointConfig,
  anIdentityId,
} from '../../../../../testing';
import { TaskPlanStatus } from '@memoflow/contracts/task';
import { createTimeContext, type UserTimeContextPort } from '@memoflow/time';

const NOW = new Date('2026-09-08T12:00:00+08:00').getTime();

describe('GetTaskDashboardUseCase', () => {
  let planRepo: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let occurrenceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: GetTaskDashboardUseCase;
  let userTimeContextPort: UserTimeContextPort;
  const identityId = anIdentityId();

  beforeEach(() => {
    planRepo = createMockRepo<ITaskPlanRepository>({
      findActiveTemplates: vi.fn().mockResolvedValue([]),
      countTasks: vi.fn().mockResolvedValue(0),
    });
    occurrenceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByDateRange: vi.fn().mockResolvedValue([]),
      findByIdentityId: vi.fn().mockResolvedValue([]),
    });
    userTimeContextPort = {
      getUserTimeContext: vi.fn().mockResolvedValue(
        createTimeContext({ timeZone: 'Asia/Shanghai', weekStartsOn: 1 }),
      ),
    };
    useCase = new GetTaskDashboardUseCase(
      planRepo,
      occurrenceRepo,
      userTimeContextPort,
      () => NOW,
    );
  });

  it('reads today/upcoming/overdue from occurrence truth, not plan due state', async () => {
    const result = await useCase.execute(identityId);

    expect(result).toBeOk();
    expect(occurrenceRepo.findByDateRange).toHaveBeenCalledTimes(2);
    expect(occurrenceRepo.findByIdentityId).toHaveBeenCalledWith(identityId);
    expect(planRepo.countTasks).toHaveBeenCalledWith(identityId, { status: TaskPlanStatus.Active });
    expect(planRepo.countTasks).toHaveBeenCalledWith(identityId, { status: TaskPlanStatus.Closed });
  });


  it('derives business-day boundaries from the canonical identity time context', async () => {
    await useCase.execute(identityId);

    expect(userTimeContextPort.getUserTimeContext).toHaveBeenCalledWith(identityId);
    expect(occurrenceRepo.findByDateRange).toHaveBeenNthCalledWith(
      1,
      identityId,
      Date.parse('2026-09-07T16:00:00.000Z'),
      Date.parse('2026-09-08T15:59:59.999Z'),
    );
  });

  it('does not extend the seven-day window by one local date across spring-forward DST', async () => {
    const dstNow = Date.parse('2026-03-08T04:30:00.000Z'); // Mar 7 23:30 America/New_York
    userTimeContextPort = {
      getUserTimeContext: vi.fn().mockResolvedValue(
        createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 }),
      ),
    };
    useCase = new GetTaskDashboardUseCase(
      planRepo,
      occurrenceRepo,
      userTimeContextPort,
      () => dstNow,
    );

    await useCase.execute(identityId);

    expect(occurrenceRepo.findByDateRange).toHaveBeenNthCalledWith(
      2,
      identityId,
      Date.parse('2026-03-08T05:00:00.000Z'),
      Date.parse('2026-03-15T03:59:59.999Z'),
    );
  });

  it('returns occurrence DTOs for today and overdue', async () => {
    const today = await aTaskOccurrence({ identityId, instanceDate: NOW });
    const overdue = await aTaskOccurrence({ identityId, instanceDate: NOW - 86_400_000 });
    vi.mocked(occurrenceRepo.findByDateRange)
      .mockResolvedValueOnce([today])
      .mockResolvedValueOnce([]);
    vi.mocked(occurrenceRepo.findByIdentityId).mockResolvedValue([overdue]);

    const result = await useCase.execute(identityId);
    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.todayTasks[0]?.id).toBe(String(today.id));
      expect(result.data.overdueTasks[0]?.id).toBe(String(overdue.id));
      expect(result.data.summary.overdue).toBe(1);
    }
  });

  it('does not mark a later-today time-point occurrence overdue at local noon', async () => {
    const todayStart = Date.parse('2026-09-07T16:00:00.000Z'); // Sep 8 00:00 Asia/Shanghai
    const laterToday = await aTaskOccurrence({
      identityId,
      instanceDate: todayStart,
      timeConfig: aTimePointConfig(18 * 60, new Date(todayStart)),
    });
    vi.mocked(occurrenceRepo.findByIdentityId).mockResolvedValue([laterToday]);

    const result = await useCase.execute(identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.overdueTasks).toEqual([]);
      expect(result.data.summary.overdue).toBe(0);
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
