import type { AIActivityItem } from '../ports/activity-read.port';

const DEFAULT_ACTIVITY_LIMIT = 10;

export interface AIOwnerActivityGoalFact {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: number;
  readonly deleted: boolean;
}

export interface AIOwnerActivityTaskPlanFact {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
  readonly deleted: boolean;
}

export interface AIOwnerActivityTaskOccurrenceFact {
  readonly id: string;
  readonly planId: string;
  readonly completed: boolean;
  readonly timestamp: number;
  readonly deleted: boolean;
}

export interface AIOwnerActivityScheduleFact {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
}

export interface ProjectAIOwnerActivityInput {
  readonly goals: readonly AIOwnerActivityGoalFact[];
  readonly taskPlans: readonly AIOwnerActivityTaskPlanFact[];
  readonly taskOccurrences: readonly AIOwnerActivityTaskOccurrenceFact[];
  readonly schedules: readonly AIOwnerActivityScheduleFact[];
  readonly since: number;
  readonly limit?: number;
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_ACTIVITY_LIMIT;
  return Math.max(1, Math.min(DEFAULT_ACTIVITY_LIMIT, Math.trunc(limit)));
}

/**
 * Projects owner facts into the small recent-activity view consumed by AI.
 *
 * This is deliberately a pure consumer projection. It stores nothing and owns
 * no cross-domain product truth.
 */
export function projectAIOwnerActivity(input: ProjectAIOwnerActivityInput): AIActivityItem[] {
  const taskTitles = new Map(input.taskPlans.map((task) => [task.id, task.title] as const));
  const items: AIActivityItem[] = [];

  for (const occurrence of input.taskOccurrences) {
    if (occurrence.deleted || !occurrence.completed || occurrence.timestamp < input.since) continue;
    items.push({
      id: `task-completed-${occurrence.id}`,
      type: 'task_completed',
      description: `完成了任务「${taskTitles.get(occurrence.planId) ?? '未命名任务'}」`,
      timestamp: occurrence.timestamp,
    });
  }

  for (const task of input.taskPlans) {
    if (task.deleted || task.createdAt < input.since) continue;
    items.push({
      id: `task-created-${task.id}`,
      type: 'task_created',
      description: `创建了新任务「${task.title}」`,
      timestamp: task.createdAt,
    });
  }

  for (const goal of input.goals) {
    if (goal.deleted || goal.updatedAt < input.since) continue;
    items.push({
      id: `goal-updated-${goal.id}`,
      type: 'goal_updated',
      description: `更新了目标「${goal.name}」的进度`,
      timestamp: goal.updatedAt,
    });
  }

  for (const schedule of input.schedules) {
    if (schedule.createdAt < input.since) continue;
    items.push({
      id: `schedule-created-${schedule.id}`,
      type: 'schedule_created',
      description: `创建了日程「${schedule.title}」`,
      timestamp: schedule.createdAt,
    });
  }

  return items
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, boundedLimit(input.limit));
}
