/** Task dashboard read composition. Occurrence time facts are occurrence-owned. */
import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { TaskFilters } from '../../../domain/repositories/i-task-plan-repository';
import type { TaskPlanClientDTO, TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskOccurrenceStatus, TaskPlanStatus } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import { createTimeFacade } from '@memoflow/time';

const taskTime = createTimeFacade();

interface TaskDashboardResponse {
  todayTasks: TaskOccurrenceClientDTO[];
  overdueTasks: TaskOccurrenceClientDTO[];
  upcomingTasks: TaskOccurrenceClientDTO[];
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
 * Dashboard composes TaskPlan intent with TaskOccurrence execution facts.
 * Due/overdue/today/upcoming never query TaskPlan because time-passage facts belong to occurrences.
 */
export class GetTaskDashboardUseCase {
  constructor(
    private readonly planRepository: ITaskPlanRepository,
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(identityId: string): Promise<Result<TaskDashboardResponse>> {
    const now = this.now();
    const todayStart = Number(taskTime.calendar.startOfDay(now));
    const todayEnd = Number(taskTime.calendar.endOfDay(todayStart));
    const upcomingEnd = Number(taskTime.calendar.endOfDay(now + 7 * 24 * 60 * 60 * 1000));

    const [todayOccurrences, overdue, upcoming, highPriority, totalActive, totalClosed] =
      await Promise.all([
        this.occurrenceRepository.findByDateRange(identityId, todayStart, todayEnd),
        this.occurrenceRepository.findOverdueInstances(identityId),
        this.occurrenceRepository.findByDateRange(identityId, todayEnd + 1, upcomingEnd),
        this.getHighPriorityTasks(identityId, 5),
        this.countTasks(identityId, { status: TaskPlanStatus.Active }),
        this.countTasks(identityId, { status: TaskPlanStatus.Closed }),
      ]);

    const today = todayOccurrences.map((occurrence) => occurrence.toClientDTO());
    const overdueDtos = overdue.map((occurrence) => occurrence.toClientDTO());
    const upcomingDtos = upcoming.map((occurrence) => occurrence.toClientDTO());
    const completedToday = todayOccurrences.filter(
      (occurrence) => occurrence.status === TaskOccurrenceStatus.Completed,
    ).length;

    return ok({
      todayTasks: today,
      overdueTasks: overdueDtos,
      upcomingTasks: upcomingDtos,
      highPriorityTasks: highPriority,
      summary: {
        totalTasks: totalActive + totalClosed,
        completedToday,
        overdue: overdueDtos.length,
        upcoming: upcomingDtos.length,
        highPriority: highPriority.length,
      },
    });
  }

  private async getHighPriorityTasks(
    identityId: string,
    limit: number,
  ): Promise<TaskPlanClientDTO[]> {
    const rank: Record<string, number> = {
      [ImportanceLevel.Vital]: 0,
      [ImportanceLevel.Important]: 1,
      [ImportanceLevel.Moderate]: 2,
      [ImportanceLevel.Minor]: 3,
      [ImportanceLevel.Trivial]: 4,
    };
    const tasks = await this.planRepository.findActiveTemplates(identityId);
    return tasks
      .sort((left, right) => rank[left.importance] - rank[right.importance])
      .slice(0, limit)
      .map((task) => task.toClientDTO());
  }

  private countTasks(identityId: string, filters?: TaskFilters): Promise<number> {
    return this.planRepository.countTasks(identityId, filters);
  }
}
