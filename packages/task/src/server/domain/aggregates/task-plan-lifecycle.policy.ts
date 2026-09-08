/** Canonical Task plan lifecycle/outcome transitions (ADR-057). */
import type { TaskEventMap, TaskPlanOutcomeValue } from '@memoflow/contracts/task';
import { TaskPlanOutcome } from '@memoflow/contracts/task';
import { TaskPlanStatus } from '../../domain/value-objects/task-plan-status';
import { InvalidTaskPlanStateError } from '../value-objects/task-errors';
import type { TaskPlanProps } from './task-plan.state';

export interface LifecycleContext {
  readonly id: import('../../domain/value-objects/task-plan-id').TaskPlanId;
  props: TaskPlanProps;
  addHistory(action: string, changes?: unknown): void;
  publishDomainEvent<T>(eventName: string, payload: T): void;
  toServerDTO(): import('@memoflow/contracts/task').TaskPlanServerDTO;
}

function assertNotDeleted(ctx: LifecycleContext, action: string): void {
  if (ctx.props.deletedAt !== null) {
    throw new InvalidTaskPlanStateError(`Cannot ${action} a deleted template`, {
      templateId: ctx.id,
      currentStatus: ctx.props.status,
      attemptedAction: action,
    });
  }
}

export function activate(ctx: LifecycleContext): void {
  assertNotDeleted(ctx, 'activate');
  if (ctx.props.status !== TaskPlanStatus.Paused || ctx.props.outcome !== TaskPlanOutcome.Open) {
    throw new InvalidTaskPlanStateError('Can only activate an open paused plan', {
      templateId: ctx.id, currentStatus: ctx.props.status, attemptedAction: 'activate',
    });
  }
  ctx.props.status = TaskPlanStatus.Active;
  ctx.props.updatedAt = Date.now();
  ctx.addHistory('resumed');
  ctx.publishDomainEvent<TaskEventMap['task:template-resumed']>('task:template-resumed', {
    identityId: ctx.props.identityId,
    taskPlanId: ctx.id,
    resumedAt: ctx.props.updatedAt,
    taskPlan: ctx.toServerDTO(),
  });
}

export function pause(ctx: LifecycleContext): void {
  assertNotDeleted(ctx, 'pause');
  if (ctx.props.status !== TaskPlanStatus.Active || ctx.props.outcome !== TaskPlanOutcome.Open) {
    throw new InvalidTaskPlanStateError('Can only pause an active open plan', {
      templateId: ctx.id, currentStatus: ctx.props.status, attemptedAction: 'pause',
    });
  }
  ctx.props.status = TaskPlanStatus.Paused;
  ctx.props.updatedAt = Date.now();
  ctx.addHistory('paused');
  ctx.publishDomainEvent<TaskEventMap['task:template-paused']>('task:template-paused', {
    identityId: ctx.props.identityId,
    taskPlanId: ctx.id,
    pausedAt: ctx.props.updatedAt,
    taskPlan: ctx.toServerDTO(),
  });
}

/** Archive is display/visibility metadata, not business lifecycle/outcome. */
export function archive(ctx: LifecycleContext): void {
  assertNotDeleted(ctx, 'archive');
  if (ctx.props.archivedAt !== null) {
    throw new InvalidTaskPlanStateError('Template is already archived', {
      templateId: ctx.id, currentStatus: ctx.props.status, attemptedAction: 'archive',
    });
  }
  ctx.props.archivedAt = Date.now();
  ctx.props.updatedAt = Date.now();
  ctx.addHistory('archived');
}

/** Deletion means mistaken creation; it never fabricates a plan outcome. */
export function softDelete(ctx: LifecycleContext): void {
  if (ctx.props.deletedAt !== null) {
    throw new InvalidTaskPlanStateError('Template is already deleted', {
      templateId: ctx.id, currentStatus: ctx.props.status, attemptedAction: 'softDelete',
    });
  }
  ctx.props.deletedAt = Date.now();
  ctx.props.updatedAt = Date.now();
  ctx.addHistory('deleted_as_mistaken_creation');
  ctx.publishDomainEvent<TaskEventMap['task:deleted']>('task:deleted', {
    identityId: ctx.props.identityId,
    taskPlanId: ctx.id,
    isSoftDelete: true,
    deletedAt: ctx.props.deletedAt,
    task: ctx.toServerDTO(),
  });
}

/** Restores mistaken deletion or removes archive visibility, without changing plan facts. */
export function restore(ctx: LifecycleContext): void {
  if (ctx.props.deletedAt === null && ctx.props.archivedAt === null) {
    throw new InvalidTaskPlanStateError('Template is neither deleted nor archived', {
      templateId: ctx.id, currentStatus: ctx.props.status, attemptedAction: 'restore',
    });
  }
  ctx.props.deletedAt = null;
  ctx.props.archivedAt = null;
  ctx.props.updatedAt = Date.now();
  ctx.addHistory('restored');
}

/** Explicit user intent; never inferred from occurrence facts. */
export function abandon(ctx: LifecycleContext, reason?: string): void {
  assertNotDeleted(ctx, 'abandon');
  if (ctx.props.status === TaskPlanStatus.Closed) {
    throw new InvalidTaskPlanStateError('Task plan is already closed', {
      templateId: ctx.id, currentStatus: ctx.props.status, attemptedAction: 'abandon',
    });
  }
  const now = Date.now();
  ctx.props.status = TaskPlanStatus.Closed;
  ctx.props.outcome = TaskPlanOutcome.Abandoned;
  ctx.props.closedAt = now;
  ctx.props.abandonedReason = reason ?? null;
  ctx.props.updatedAt = now;
  ctx.addHistory('abandoned', { reason: reason ?? null });
}

/** Automatic evaluator result; unknown/correctable facts remain Open, never default to Failed. */
export function applyEvaluation(
  ctx: LifecycleContext,
  outcome: Exclude<TaskPlanOutcomeValue, 'Abandoned'>,
): void {
  if (ctx.props.outcome === TaskPlanOutcome.Abandoned) return;
  if (ctx.props.outcome === outcome &&
      ((outcome === TaskPlanOutcome.Open && ctx.props.status !== TaskPlanStatus.Closed) ||
       (outcome !== TaskPlanOutcome.Open && ctx.props.status === TaskPlanStatus.Closed))) {
    return;
  }
  const now = Date.now();
  ctx.props.outcome = outcome;
  if (outcome === TaskPlanOutcome.Open) {
    if (ctx.props.status === TaskPlanStatus.Closed) ctx.props.status = TaskPlanStatus.Active;
    ctx.props.closedAt = null;
  } else {
    ctx.props.status = TaskPlanStatus.Closed;
    ctx.props.closedAt = now;
  }
  ctx.props.abandonedReason = null;
  ctx.props.updatedAt = now;
  ctx.addHistory('plan_outcome_evaluated', { outcome });
}
