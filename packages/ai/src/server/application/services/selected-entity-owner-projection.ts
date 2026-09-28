import type { GoalClientDTO } from '@memoflow/contracts/goal';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import type { AISelectedEntityContextProjection } from '../ports/selected-entity-context-read.port';

/** Bounded authoritative Goal projection exposed to the assistant context layer. */
export function projectSelectedGoalContext(goal: GoalClientDTO): AISelectedEntityContextProjection {
  return {
    source: 'goal.owner.read-model',
    content: {
      entityType: 'goal',
      id: String(goal.id),
      name: goal.name,
      summary: goal.summary,
      description: goal.description,
      status: goal.status,
      start: goal.start,
      target: goal.target,
      overallProgress: goal.overallProgress,
      keyResults:
        goal.keyResults?.map((keyResult) => ({
          id: String(keyResult.id),
          title: keyResult.title,
          description: keyResult.description,
          progress: keyResult.progress,
          target: keyResult.target,
          progressPercentage: keyResult.progressPercentage,
          isCompleted: keyResult.isCompleted,
          weight: keyResult.weight,
        })) ?? [],
      labels: goal.labels.map((label) => ({ id: String(label.id), name: label.name })),
    },
  };
}

/** Bounded authoritative Task Plan projection exposed to the assistant context layer. */
export function projectSelectedTaskContext(
  task: TaskPlanClientDTO,
): AISelectedEntityContextProjection {
  return {
    source: 'task.owner.read-model',
    content: {
      entityType: 'task',
      id: String(task.id),
      name: task.name,
      description: task.description,
      status: task.status,
      outcome: task.outcome,
      schedule: task.schedule,
      reminderConfig: task.reminderConfig,
      importance: task.importance,
      goalBinding: task.goalBinding,
      checklist: task.checklist,
      labels: task.labels.map((label) => ({ id: String(label.id), name: label.name })),
      occurrenceCount: task.occurrenceCount,
      completedOccurrenceCount: task.completedOccurrenceCount,
      pendingOccurrenceCount: task.pendingOccurrenceCount,
      dueOccurrenceCount: task.dueOccurrenceCount,
      completedDueOccurrenceCount: task.completedDueOccurrenceCount,
      futurePendingOccurrenceCount: task.futurePendingOccurrenceCount,
      singleOccurrenceStatus: task.singleOccurrenceStatus,
      completionRate: task.completionRate,
    },
  };
}
