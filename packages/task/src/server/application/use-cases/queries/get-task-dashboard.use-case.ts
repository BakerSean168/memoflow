/** Task dashboard read composition. Occurrence time facts are occurrence-owned. */
import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { TaskFilters } from '../../../domain/repositories/i-task-plan-repository';
import type { TaskPlanClientDTO, TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskOccurrenceStatus, TaskPlanStatus } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import { createTimeFacade, type TimeContext, type UserTimeContextPort } from '@memoflow/time';

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
    private readonly userTimeContextPort: UserTimeContextPort,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(identityId: string): Promise<Result<TaskDashboardResponse>> {
    const now = this.now();
    const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
    const taskTime = createTimeFacade({ context: timeContext });
    const todayStart = Number(taskTime.calendar.startOfDay(now));
    const todayEnd = Number(taskTime.calendar.endOfDay(todayStart));
    const upcomingEnd = Number(taskTime.calendar.endOfDay(taskTime.calendar.addDays(now, 7)));

    const [todayOccurrences, overdueCandidates, upcoming, highPriority, totalActive, totalClosed] =
      await Promise.all([
        this.occurrenceRepository.findByDateRange(identityId, todayStart, todayEnd),
        this.occurrenceRepository.findByIdentityId(identityId),
        this.occurrenceRepository.findByDateRange(identityId, todayEnd + 1, upcomingEnd),
        this.getHighPriorityTasks(identityId, 5, timeContext, now),
        this.countTasks(identityId, { status: TaskPlanStatus.Active }),
        this.countTasks(identityId, { status: TaskPlanStatus.Closed }),
      ]);

    const overdue = overdueCandidates.filter((occurrence) =>
      occurrence.isOverdueAt(timeContext, now),
    );
    const today = todayOccurrences.map((occurrence) => occurrence.toClientDTOAt(timeContext, now));
    const overdueDtos = overdue.map((occurrence) => occurrence.toClientDTOAt(timeContext, now));
    const upcomingDtos = upcoming.map((occurrence) => occurrence.toClientDTOAt(timeContext, now));
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
    timeContext: TimeContext,
    now: number,
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
      .map((task) => task.toClientDTOAt(timeContext, false, now));
  }

  private countTasks(identityId: string, filters?: TaskFilters): Promise<number> {
    return this.planRepository.countTasks(identityId, filters);
  }
}
