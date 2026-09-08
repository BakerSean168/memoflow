/**
 * Get Task Dashboard Service
 *
 * 鑾峰彇浠诲姟浠爮鏉挎暟锟?
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { TaskFilters } from '../../../domain/repositories/i-task-plan-repository';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskPlanStatus } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';

interface TaskDashboardResponse {
  todayTasks: TaskPlanClientDTO[];
  overdueTasks: TaskPlanClientDTO[];
  upcomingTasks: TaskPlanClientDTO[];
  highPriorityTasks: TaskPlanClientDTO[];
  summary: {
    totalTasks: number;
    completedToday: number;
    overdue: number;
    upcoming: number;
    highPriority: number;
  };
}

/**
 * Get Task Dashboard Service
 */
export class GetTaskDashboardUseCase {
  constructor(private readonly templateRepository: ITaskPlanRepository) {}

  async execute(identityId: string): Promise<Result<TaskDashboardResponse>> {

    // 骞惰鏌ヨ鎵€鏈夋暟锟?
    const [
      today,
      overdue,
      upcoming,
      highPriority,
      _recentCompleted,
      totalActive,
      totalCompleted,
    ] = await Promise.all([
      this.getTodayTasks(identityId),
      this.getOverdueTasks(identityId),
      this.getUpcomingTasks(identityId, 7),
      this.getHighPriorityTasks(identityId, 5),
      this.getRecentCompletedTasks(identityId, 10),
      this.countTasks(identityId, { status: TaskPlanStatus.Active }),
      this.countTasks(identityId, { status: TaskPlanStatus.Closed }),
    ]);

    const _completionRate =
      totalActive + totalCompleted > 0
        ? Math.round((totalCompleted / (totalActive + totalCompleted)) * 100)
        : 0;

    return ok({
      todayTasks: today,
      overdueTasks: overdue,
      upcomingTasks: upcoming,
      highPriorityTasks: highPriority,
      summary: {
        totalTasks: totalActive + totalCompleted,
        completedToday: totalCompleted,
        overdue: overdue.length,
        upcoming: upcoming.length,
        highPriority: highPriority.length,
      },
    });
  }

  private async getTodayTasks(identityId: string): Promise<TaskPlanClientDTO[]> {
    const tasks = await this.templateRepository.findTodayTasks(identityId);
    return tasks.map((t) => t.toClientDTO());
  }

  private async getOverdueTasks(identityId: string): Promise<TaskPlanClientDTO[]> {
    const tasks = await this.templateRepository.findOverdueTasks(identityId);
    return tasks.map((t) => t.toClientDTO());
  }


  private async getUpcomingTasks(identityId: string, daysAhead: number): Promise<TaskPlanClientDTO[]> {
    const tasks = await this.templateRepository.findUpcomingTasks(identityId, daysAhead);
    return tasks.map((t) => t.toClientDTO());
  }

  private async getHighPriorityTasks(identityId: string, limit: number): Promise<TaskPlanClientDTO[]> {
    const rank: Record<string, number> = {
      [ImportanceLevel.Vital]: 0,
      [ImportanceLevel.Important]: 1,
      [ImportanceLevel.Moderate]: 2,
      [ImportanceLevel.Minor]: 3,
      [ImportanceLevel.Trivial]: 4,
    };
    const tasks = await this.templateRepository.findActiveTemplates(identityId);
    return tasks
      .sort((left, right) => rank[left.importance] - rank[right.importance])
      .slice(0, limit)
      .map((task) => task.toClientDTO());
  }

  private async getRecentCompletedTasks(identityId: string, limit: number): Promise<TaskPlanClientDTO[]> {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const tasks = await this.templateRepository.findOneTimeTasks(identityId, {
      status: TaskPlanStatus.Closed,
    });

    return tasks
      .filter((t) => t.updatedAt && Number(t.updatedAt) >= sevenDaysAgo)
      .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
      .slice(0, limit)
      .map((t) => t.toClientDTO());
  }

  private async countTasks(identityId: string, filters?: TaskFilters): Promise<number> {
    return await this.templateRepository.countTasks(identityId, filters);
  }
}
