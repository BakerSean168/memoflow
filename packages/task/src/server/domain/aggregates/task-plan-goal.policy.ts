/**
 * Goal binding policy for TaskPlan.
 *
 * Pure functions that handle goal linking/binding operations.
 * Extracted from TaskPlan aggregate to reduce aggregate size.
 */

import type { GoalContributionRule } from '@memoflow/contracts/task';
import { TaskGoalBindingTrigger } from '@memoflow/contracts/task';
import { TaskPlanStatus } from '../../domain/value-objects/task-plan-status';
import { TaskType } from '../value-objects';
import { TaskGoalBinding, type RecurrenceRule } from '../value-objects';
import { InvalidGoalBindingError } from '../value-objects/task-errors';
import type { TaskPlanProps } from './task-plan.state';

/** Mutable context for goal operations. */
export interface GoalOperationContext {
  props: TaskPlanProps;
  readonly id: string;
  addHistory(action: string, changes?: unknown): void;
}

/** Whole-plan progress is meaningful only when the task has a closed execution scope. */
export function isFiniteTaskPlan(
  taskType: TaskType,
  recurrenceRule: RecurrenceRule | null | undefined,
): boolean {
  return taskType === TaskType.OneTime || Boolean(recurrenceRule?.hasEndCondition);
}

/** Binds the template to a goal. */
export function bindToGoal(
  ctx: GoalOperationContext,
  goalId: string,
  keyResultId: string | null = null,
  contribution: GoalContributionRule | null = null,
): void {
  if (!goalId) {
    throw new InvalidGoalBindingError('Goal ID is required');
  }
  if (keyResultId === '') {
    throw new InvalidGoalBindingError('Key Result ID cannot be empty');
  }
  if (contribution && !keyResultId) {
    throw new InvalidGoalBindingError('Automatic Goal contribution requires a Key Result');
  }
  if (ctx.props.status === TaskPlanStatus.Closed || ctx.props.deletedAt !== null) {
    throw new InvalidGoalBindingError(
      'Cannot change goal binding on a closed or deleted task plan',
    );
  }
  if (ctx.props.goalBinding) {
    throw new InvalidGoalBindingError('Template is already bound to a goal');
  }
  if (
    contribution?.trigger === TaskGoalBindingTrigger.PlanCompletion &&
    !isFiniteTaskPlan(ctx.props.taskType, ctx.props.recurrenceRule)
  ) {
    throw new InvalidGoalBindingError('Whole-plan goal progress requires a finite task plan');
  }

  ctx.props.goalBinding = TaskGoalBinding.create({
    goalId: goalId as TaskGoalBinding['goalId'],
    keyResultId: keyResultId as TaskGoalBinding['keyResultId'],
    contribution,
  });
  ctx.props.updatedAt = Date.now();
  ctx.addHistory('goal_bound', { goalId, keyResultId, contribution });
}

/** Unbinds from the current goal. */
export function unbindFromGoal(ctx: GoalOperationContext): void {
  if (!ctx.props.goalBinding) {
    throw new InvalidGoalBindingError('Template is not bound to any goal');
  }
  if (ctx.props.status === TaskPlanStatus.Closed || ctx.props.deletedAt !== null) {
    throw new InvalidGoalBindingError(
      'Cannot change goal binding on a closed or deleted task plan',
    );
  }

  const { goalId: oldGoalId, keyResultId: oldKeyResultId } = ctx.props.goalBinding;
  ctx.props.goalBinding = null;
  ctx.props.updatedAt = Date.now();
  ctx.addHistory('goal_unbound', { oldGoalId, oldKeyResultId });
}

/** Checks whether the template is linked to a goal. */
export function isLinkedToGoal(props: TaskPlanProps): boolean {
  return props.goalBinding !== null;
}
