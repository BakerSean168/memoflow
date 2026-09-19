import { projectAIOwnerActivity } from '@memoflow/ai';
import type { IAIActivityReadPort } from '@memoflow/ai/ports';
import { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import type { IGoalRepository } from '@memoflow/goal';
import type { IScheduleRepository } from '@memoflow/schedule';
import type { ITaskOccurrenceRepository, ITaskPlanRepository } from '@memoflow/task';

/**
 * Desktop recent-activity adapter over canonical owner reads.
 *
 * HOME-1804 keeps this host adapter thin: it reads owner facts and delegates
 * projection semantics to the shared AI application helper.
 */
export class DesktopActivityAIReadAdapter implements IAIActivityReadPort {
  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly taskPlanRepository: ITaskPlanRepository,
    private readonly taskOccurrenceRepository: ITaskOccurrenceRepository,
    private readonly scheduleRepository: IScheduleRepository,
  ) {}

  async listRecent(input: Parameters<IAIActivityReadPort['listRecent']>[0]) {
    const [goals, taskPlans, taskOccurrences, schedules] = await Promise.all([
      this.goalRepository.findByIdentityId(input.identityId, {
        includeChildren: false,
        systemView: 'active',
      }),
      this.taskPlanRepository.findByIdentityId(input.identityId),
      this.taskOccurrenceRepository.findByIdentityId(input.identityId),
      this.scheduleRepository.findByIdentityId(input.identityId),
    ]);

    return projectAIOwnerActivity({
      goals: goals.map((goal) => ({
        id: String(goal.id),
        name: goal.name,
        updatedAt: Number(goal.updatedAt),
        deleted: goal.deletedAt !== null,
      })),
      taskPlans: taskPlans.map((task) => ({
        id: String(task.id),
        title: task.title,
        createdAt: Number(task.createdAt),
        deleted: task.deletedAt !== null,
      })),
      taskOccurrences: taskOccurrences.map((occurrence) => ({
        id: String(occurrence.id),
        planId: String(occurrence.planId),
        completed: occurrence.status === TaskOccurrenceStatus.Completed,
        timestamp: occurrence.result?.recordedAt ?? Number(occurrence.updatedAt),
        deleted: occurrence.deletedAt !== null,
      })),
      schedules: schedules.map((schedule) => ({
        id: String(schedule.id),
        title: schedule.title,
        createdAt: Number(schedule.createdAt),
      })),
      since: input.since,
      limit: input.limit,
    });
  }
}
