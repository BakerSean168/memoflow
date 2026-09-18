import type { IAIActivityReadPort } from '@memoflow/ai/ports';
import { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import type { IGoalRepository } from '@memoflow/goal';
import type { IScheduleRepository } from '@memoflow/schedule';
import type { ITaskOccurrenceRepository, ITaskPlanRepository } from '@memoflow/task';

const DEFAULT_ACTIVITY_LIMIT = 10;

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_ACTIVITY_LIMIT;
  return Math.max(1, Math.min(DEFAULT_ACTIVITY_LIMIT, Math.trunc(limit)));
}

/**
 * Desktop's transitional activity projection.
 *
 * Desktop has no local ActivityLedger table. It derives the same bounded
 * recent-activity facts from current Goal/Task/Schedule owner reads until
 * HOME-1804 decides whether a durable activity capability is warranted.
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
    const taskTitles = new Map(taskPlans.map((task) => [String(task.id), task.title] as const));
    const items: Array<Awaited<ReturnType<IAIActivityReadPort['listRecent']>>[number]> = [];

    for (const occurrence of taskOccurrences) {
      if (occurrence.deletedAt !== null || occurrence.status !== TaskOccurrenceStatus.Completed) {
        continue;
      }
      const timestamp = occurrence.result?.recordedAt ?? Number(occurrence.updatedAt);
      if (timestamp < input.since) continue;
      items.push({
        id: `task-completed-${String(occurrence.id)}`,
        type: 'task_completed',
        description: `完成了任务「${taskTitles.get(String(occurrence.planId)) ?? '未命名任务'}」`,
        timestamp,
      });
    }

    for (const task of taskPlans) {
      const timestamp = Number(task.createdAt);
      if (task.deletedAt !== null || timestamp < input.since) continue;
      items.push({
        id: `task-created-${String(task.id)}`,
        type: 'task_created',
        description: `创建了新任务「${task.title}」`,
        timestamp,
      });
    }

    for (const goal of goals) {
      const timestamp = Number(goal.updatedAt);
      if (goal.deletedAt !== null || timestamp < input.since) continue;
      items.push({
        id: `goal-updated-${String(goal.id)}`,
        type: 'goal_updated',
        description: `更新了目标「${goal.name}」的进度`,
        timestamp,
      });
    }

    for (const schedule of schedules) {
      const timestamp = Number(schedule.createdAt);
      if (timestamp < input.since) continue;
      items.push({
        id: `schedule-created-${String(schedule.id)}`,
        type: 'schedule_created',
        description: `创建了日程「${schedule.title}」`,
        timestamp,
      });
    }

    return items
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, boundedLimit(input.limit));
  }
}
