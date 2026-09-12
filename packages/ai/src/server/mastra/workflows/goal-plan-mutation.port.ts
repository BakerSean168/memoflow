import type { GoalPlanExecutionReceipt } from '@memoflow/contracts/ai';
import type { CreateGoalReq } from '@memoflow/contracts/goal';
import type { CreateReminderTemplateReq } from '@memoflow/contracts/reminder';
import type { Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { CreateTaskPlanReq } from '@memoflow/contracts/task';

export type GoalMutationResult = {
  goalId: string;
  keyResultIds: string[];
};

export type TaskPlanMutationResult = { taskId: string };
export type ReminderMutationResult = { reminderId: string };

/**
 * Narrow host binding consumed by the Mastra goal.create workflow.
 *
 * The AI package owns orchestration and request mapping; the API/Desktop host
 * binds these calls to the already-composed Goal/Task/Reminder application
 * ports. This avoids a package dependency from AI back into feature
 * implementations while keeping domain writes behind canonical application
 * ports.
 */
export interface GoalPlanMutationPort {
  resolveLabels(names: readonly string[], context: ExecutionContext): Promise<Result<string[]>>;
  createGoal(
    request: CreateGoalReq,
    context: ExecutionContext,
  ): Promise<Result<GoalMutationResult>>;
  createTaskPlan(
    request: CreateTaskPlanReq,
    context: ExecutionContext,
  ): Promise<Result<TaskPlanMutationResult>>;
  createReminder(
    request: CreateReminderTemplateReq,
    context: ExecutionContext,
  ): Promise<Result<ReminderMutationResult>>;
}

export interface ApplyGoalPlanInput {
  readonly workflowRunId: string;
  readonly draft: import('@memoflow/contracts/ai').GoalPlanDraft;
  readonly context: ExecutionContext;
  readonly timeZone: string;
  readonly priorReceipt?: GoalPlanExecutionReceipt;
}
