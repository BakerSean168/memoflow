import { projectAIOwnerActivity } from '@memoflow/ai';
import type { IAIActivityReadPort } from '@memoflow/ai/ports';
import { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import type { IGoalRepository } from '@memoflow/goal';
import type { IScheduleRepository } from '@memoflow/schedule';
import type { ITaskOccurrenceRepository, ITaskPlanRepository } from '@memoflow/task';

export interface OwnerActivityAIReadDependencies {
  readonly goalRepository: IGoalRepository;
  readonly taskPlanRepository: ITaskPlanRepository;
  readonly taskOccurrenceRepository: ITaskOccurrenceRepository;
  readonly scheduleRepository: IScheduleRepository;
}

/**
 * API-side recent-activity projection derived directly from owner truth.
 *
 * HOME-1804 retired the cross-domain activity ledger: recent activity is a
 * bounded AI consumer projection, not a second durable product authority.
 */
export class OwnerActivityAIReadAdapter implements IAIActivityReadPort {
  constructor(private readonly dependencies: OwnerActivityAIReadDependencies) {}

  async listRecent(input: Parameters<IAIActivityReadPort['listRecent']>[0]) {
    const [goals, taskPlans, taskOccurrences, schedules] = await Promise.all([
      this.dependencies.goalRepository.findByIdentityId(input.identityId, {
        includeChildren: false,
        systemView: 'active',
      }),
      this.dependencies.taskPlanRepository.findByIdentityId(input.identityId),
      this.dependencies.taskOccurrenceRepository.findByIdentityId(input.identityId),
      this.dependencies.scheduleRepository.findByIdentityId(input.identityId),
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
