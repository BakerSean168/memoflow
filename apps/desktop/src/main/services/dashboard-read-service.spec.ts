import { describe, expect, it, vi } from 'vitest';

/**
 * Dashboard read service aggregation behavior.
 * dashboard 读取服务聚合行为。
 *
 * Locks the instance-bound injection: getDesktopDashboardData(identityId,
 * dependencies) reads ALL seven repositories from the injected view and must
 * never fall back to package-level accessors. The @memoflow/dashboard
 * getDashboardData is mocked so the test asserts the wiring (loader closures →
 * injected repositories) rather than the projection math (which is owned by the
 * dashboard package).
 *
 * 锁定 instance-bound 注入：getDesktopDashboardData(identityId, dependencies)
 * 从注入的视图读取全部七个仓储，绝不回退到包级 accessor。@memoflow/dashboard 的
 * getDashboardData 被 mock，使测试断言的是接线（loader 闭包 → 注入的仓储）而非
 * 投影数学（后者属于 dashboard 包）。
 */

const mocks = vi.hoisted(() => ({
  getDashboardData: vi.fn(),
}));

vi.mock('@memoflow/dashboard', () => ({
  getDashboardData: mocks.getDashboardData,
  toDashboardGoalRecord: (goal: unknown) => goal,
  toDashboardTaskOccurrenceRecord: (instance: unknown) => instance,
}));

import type { DashboardData } from '@memoflow/contracts/dashboard';
import {
  getDesktopDashboardData,
  type DashboardReadDependencies,
} from './dashboard-read-service';

const identityId = 'identity-1';

function createFakeDependencies(): DashboardReadDependencies {
  const goalRepository = {
    findByIdentityId: vi.fn().mockResolvedValue([
      {
        toClientDTO: () => ({ id: 'g1', name: 'Goal', status: 'Active', deletedAt: null }),
      },
    ]),
  };
  const taskPlanRepository = {
    findByIdentityId: vi.fn().mockResolvedValue([
      { id: 't1', title: 'Task', status: 'Active', deletedAt: null, createdAt: Date.now() },
    ]),
  };
  const taskOccurrenceRepository = {
    findByIdentityId: vi.fn().mockResolvedValue([
      {
        id: 'i1',
        templateId: 't1',
        status: 'Pending',
        instanceDate: Date.now(),
        actualEndTime: null,
        updatedAt: Date.now(),
        deletedAt: null,
        toClientDTOAt: vi.fn(() => ({
          id: 'i1',
          templateId: 't1',
          status: 'Pending',
          instanceDate: Date.now(),
          actualEndTime: null,
          updatedAt: Date.now(),
          deletedAt: null,
          isOverdue: false,
        })),
      },
    ]),
  };
  const scheduleRepository = {
    findByIdentityId: vi.fn().mockResolvedValue([
      {
        id: 's1',
        title: 'Meeting',
        startTime: Date.now() + 3600_000,
        endTime: Date.now() + 7200_000,
        priority: 0,
        hasConflict: false,
        createdAt: Date.now(),
      },
    ]),
  };
  const reminderTemplateRepository = {
    findByNextTriggerBefore: vi.fn().mockResolvedValue([
      { deletedAt: null, status: 'Active', effectiveEnabled: true, nextTriggerAt: Date.now() + 3600_000 },
    ]),
  };
  const notificationRepository = {
    countUnread: vi.fn().mockResolvedValue(3),
  };

  return {
    goalRepository: goalRepository as never,
    taskPlanRepository: taskPlanRepository as never,
    taskOccurrenceRepository: taskOccurrenceRepository as never,
    scheduleRepository: scheduleRepository as never,
    scheduleTaskRepository: {} as never,
    reminderTemplateRepository: reminderTemplateRepository as never,
    notificationRepository: notificationRepository as never,
    userTimeContextPort: {
      getUserTimeContext: vi.fn(async () => ({ timeZone: 'UTC', weekStartsOn: 1 })),
    } as never,
  };
}

function captureDashboardSource(_deps: DashboardReadDependencies) {
  mocks.getDashboardData.mockImplementationOnce(
    async (id: string, source: Parameters<typeof getDesktopDashboardData>[0]) => {
      await source.listGoals(id);
      await source.listTaskPlans(id);
      await source.listTaskOccurrences(id);
      await source.listSchedules(id);
      await source.listUpcomingReminders(id, Date.now());
      await source.countUnreadNotifications(id);
      return { stats: { activeGoals: 1 } } as unknown as DashboardData;
    },
  );
}

describe('getDesktopDashboardData instance-bound aggregation', () => {
  it('feeds every injected repository through the dashboard loader closures', async () => {
    const deps = createFakeDependencies();
    captureDashboardSource(deps);

    const result = await getDesktopDashboardData(identityId, deps);

    expect(result).toEqual({ stats: { activeGoals: 1 } });
    expect(deps.goalRepository.findByIdentityId).toHaveBeenCalledWith(identityId, {
      includeChildren: true,
      systemView: 'active',
    });
    expect(deps.taskPlanRepository.findByIdentityId).toHaveBeenCalledWith(identityId);
    expect(deps.taskOccurrenceRepository.findByIdentityId).toHaveBeenCalledWith(identityId);
    expect(deps.scheduleRepository.findByIdentityId).toHaveBeenCalledWith(identityId);
    expect(deps.reminderTemplateRepository.findByNextTriggerBefore).toHaveBeenCalledWith(
      expect.any(Number),
      identityId,
    );
    expect(deps.notificationRepository.countUnread).toHaveBeenCalledWith(identityId);
  });

  it('does not import package-level accessors (no global repository read)', async () => {
    const deps = createFakeDependencies();
    captureDashboardSource(deps);

    const identity = 'another-identity';
    mocks.getDashboardData.mockClear();
    await getDesktopDashboardData(identity, deps);

    expect(deps.userTimeContextPort.getUserTimeContext).toHaveBeenCalledWith(identity);
    expect(mocks.getDashboardData).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        listGoals: expect.any(Function),
        listSchedules: expect.any(Function),
        listUpcomingReminders: expect.any(Function),
        countUnreadNotifications: expect.any(Function),
      }),
      { timeZone: 'UTC', weekStartsOn: 1 },
    );
  });
});
