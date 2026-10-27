import { TaskOccurrenceStatus } from '@memoflow/task-contracts';
import type { ITaskOccurrenceRepository } from '../../domain/repositories/i-task-occurrence-repository';
import type { ITaskPlanRepository } from '../../domain/repositories/i-task-plan-repository';

const DEFAULT_ACTIVITY_LIMIT = 10;

export interface TaskActivityReadOptions {
  /** Inclusive lower bound expressed as a Product Time instant. */
  readonly since: number;
  readonly limit?: number;
}

export interface TaskActivityItem {
  readonly id: string;
  readonly type: 'task_completed' | 'task_created';
  readonly description: string;
  readonly timestamp: number;
}

export interface TaskActivityReadServiceDependencies {
  readonly taskPlanRepository: ITaskPlanRepository;
  readonly taskOccurrenceRepository: ITaskOccurrenceRepository;
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_ACTIVITY_LIMIT;
  return Math.max(1, Math.min(DEFAULT_ACTIVITY_LIMIT, Math.trunc(limit)));
}

/**
 * Read-only, identity-scoped task activity projection.
 *
 * Task owns both activity streams it derives from its own facts: completed
 * occurrences (resolved against plan titles) and newly created plans. Hosts
 * consume the pre-projected items and never touch task persistence shapes.
 */
export class TaskActivityReadService {
  constructor(private readonly dependencies: TaskActivityReadServiceDependencies) {}

  async listRecentActivity(
    identityId: string,
    options: TaskActivityReadOptions,
  ): Promise<TaskActivityItem[]> {
    const [taskPlans, taskOccurrences] = await Promise.all([
      this.dependencies.taskPlanRepository.findByIdentityId(identityId),
      this.dependencies.taskOccurrenceRepository.findByIdentityId(identityId),
    ]);

    const planTitles = new Map(
      taskPlans.map((task) => [String(task.id), task.title] as const),
    );
    const items: TaskActivityItem[] = [];

    for (const occurrence of taskOccurrences) {
      const timestamp = occurrence.result?.recordedAt ?? Number(occurrence.updatedAt);
      if (
        occurrence.deletedAt !== null ||
        occurrence.status !== TaskOccurrenceStatus.Completed ||
        timestamp < options.since
      ) {
        continue;
      }
      items.push({
        id: `task-completed-${String(occurrence.id)}`,
        type: 'task_completed',
        description: `完成了任务「${planTitles.get(String(occurrence.planId)) ?? '未命名任务'}」`,
        timestamp,
      });
    }

    for (const task of taskPlans) {
      const timestamp = Number(task.createdAt);
      if (task.deletedAt !== null || timestamp < options.since) continue;
      items.push({
        id: `task-created-${String(task.id)}`,
        type: 'task_created',
        description: `创建了新任务「${task.title}」`,
        timestamp,
      });
    }

    return items
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, boundedLimit(options.limit));
  }
}
