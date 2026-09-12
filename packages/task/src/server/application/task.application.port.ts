import type { ActivateTaskPlanUseCase } from './use-cases/commands/activate-task-plan.use-case';
import type { ArchiveTaskPlanUseCase } from './use-cases/commands/archive-task-plan.use-case';
import type { AbandonTaskPlanUseCase } from './use-cases/commands/abandon-task-plan.use-case';
import type { BindTaskToGoalUseCase } from './use-cases/commands/bind-task-to-goal.use-case';
import type { MarkTaskOccurrenceMissedUseCase } from './use-cases/commands/mark-task-occurrence-missed.use-case';
import type { RescheduleTaskOccurrenceUseCase } from './use-cases/commands/reschedule-task-occurrence.use-case';
import type { CompleteTaskOccurrenceUseCase } from './use-cases/commands/complete-task-occurrence.use-case';
import type { UncompleteTaskOccurrenceUseCase } from './use-cases/commands/uncomplete-task-occurrence.use-case';
import type { CreateTaskPlanUseCase } from './use-cases/commands/create-task-plan.use-case';
import type { DeleteTaskOccurrenceUseCase } from './use-cases/commands/delete-task-occurrence.use-case';
import type { DeleteTaskPlanUseCase } from './use-cases/commands/delete-task-plan.use-case';
import type { GenerateTaskOccurrencesUseCase } from './use-cases/commands/generate-task-occurrences.use-case';
import type { PauseTaskPlanUseCase } from './use-cases/commands/pause-task-plan.use-case';
import type { SkipTaskOccurrenceUseCase } from './use-cases/commands/skip-task-occurrence.use-case';
import type { StartTaskOccurrenceUseCase } from './use-cases/commands/start-task-occurrence.use-case';
import type { UnbindTaskFromGoalUseCase } from './use-cases/commands/unbind-task-from-goal.use-case';
import type { UpdateTaskPlanUseCase } from './use-cases/commands/update-task-plan.use-case';
import type { GetTaskOccurrenceUseCase } from './use-cases/queries/get-task-occurrence.use-case';
import type { GetTaskOccurrencesByDateRangeUseCase } from './use-cases/queries/get-task-occurrences-by-date-range.use-case';
import type { GetTaskPlanUseCase } from './use-cases/queries/get-task-plan.use-case';
import type { ListTaskOccurrencesByAccountUseCase } from './use-cases/queries/list-task-occurrences-by-account.use-case';
import type { ListTaskOccurrencesByStatusUseCase } from './use-cases/queries/list-task-occurrences-by-status.use-case';
import type { ListTaskOccurrencesByTemplateUseCase } from './use-cases/queries/list-task-occurrences-by-template.use-case';
import type { ListTaskPlansUseCase } from './use-cases/queries/list-task-plans.use-case';

type TaskPortFn<T extends (...args: never[]) => unknown> = (
  ...args: Parameters<T>
) => ReturnType<T>;

/** Transport-neutral callable application surface. */
export interface TaskApplicationPort {
  // Template commands
  createTaskPlan: TaskPortFn<CreateTaskPlanUseCase['execute']>;
  updateTaskPlan: TaskPortFn<UpdateTaskPlanUseCase['execute']>;
  activateTaskPlan: TaskPortFn<ActivateTaskPlanUseCase['execute']>;
  pauseTaskPlan: TaskPortFn<PauseTaskPlanUseCase['execute']>;
  archiveTaskPlan: TaskPortFn<ArchiveTaskPlanUseCase['execute']>;
  abandonTaskPlan: TaskPortFn<AbandonTaskPlanUseCase['execute']>;
  deleteTaskPlan: TaskPortFn<DeleteTaskPlanUseCase['execute']>;
  generateTaskOccurrences: TaskPortFn<GenerateTaskOccurrencesUseCase['execute']>;
  bindTaskToGoal: TaskPortFn<BindTaskToGoalUseCase['execute']>;
  unbindTaskFromGoal: TaskPortFn<UnbindTaskFromGoalUseCase['execute']>;

  // Template queries
  getTaskPlan: TaskPortFn<GetTaskPlanUseCase['execute']>;
  listTaskPlans: TaskPortFn<ListTaskPlansUseCase['execute']>;

  // Instance commands
  completeTaskOccurrence: TaskPortFn<CompleteTaskOccurrenceUseCase['execute']>;
  uncompleteTaskOccurrence: TaskPortFn<UncompleteTaskOccurrenceUseCase['execute']>;
  skipTaskOccurrence: TaskPortFn<SkipTaskOccurrenceUseCase['execute']>;
  markTaskOccurrenceMissed: TaskPortFn<MarkTaskOccurrenceMissedUseCase['execute']>;
  startTaskOccurrence: TaskPortFn<StartTaskOccurrenceUseCase['execute']>;
  deleteTaskOccurrence: TaskPortFn<DeleteTaskOccurrenceUseCase['execute']>;
  rescheduleTaskOccurrence: TaskPortFn<RescheduleTaskOccurrenceUseCase['execute']>;

  // Instance queries
  getTaskOccurrence: TaskPortFn<GetTaskOccurrenceUseCase['execute']>;
  listTaskOccurrencesByAccount: TaskPortFn<ListTaskOccurrencesByAccountUseCase['execute']>;
  listTaskOccurrencesByTemplate: TaskPortFn<ListTaskOccurrencesByTemplateUseCase['execute']>;
  listTaskOccurrencesByStatus: TaskPortFn<ListTaskOccurrencesByStatusUseCase['execute']>;
  getTaskOccurrencesByDateRange: TaskPortFn<GetTaskOccurrencesByDateRangeUseCase['execute']>;
}
