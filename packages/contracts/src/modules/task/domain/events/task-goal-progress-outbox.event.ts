import type {
  IdentityId,
  GoalId,
  KeyResultId,
  TaskOccurrenceId,
  TaskPlanId,
} from '../../../../primitives';

/** Explicit settlement source owned by the durable Task -> Goal contract. */
export const TaskGoalSettlementSourceType = {
  TaskOccurrence: 'TaskOccurrence',
  TaskPlan: 'TaskPlan',
} as const;
export type TaskGoalSettlementSourceTypeValue =
  (typeof TaskGoalSettlementSourceType)[keyof typeof TaskGoalSettlementSourceType];

export interface TaskGoalSettlementSource {
  type: TaskGoalSettlementSourceTypeValue;
  id: string;
}

interface TaskGoalProgressOutboxEventV2Base {
  eventId: string;
  schemaVersion: 2;
  eventType: 'task.goal-progress-requested';
  identityId: IdentityId;
  taskOccurrenceId: TaskOccurrenceId;
  taskPlanId: TaskPlanId;
  occurredAt: number;
}

/** Apply one configured Task contribution to a Goal KR. */
export interface TaskGoalProgressApplyEventV2 extends TaskGoalProgressOutboxEventV2Base {
  action: 'apply';
  goalId: GoalId;
  keyResultId: KeyResultId;
  value: number;
  source: TaskGoalSettlementSource;
  taskTitle: string;
}

/**
 * Revert Task-owned contribution sources after an execution correction.
 * A correction intentionally names both possible source identities so Goal never
 * has to infer settlement source from a trigger or re-read Task state.
 */
export interface TaskGoalProgressRevertEventV2 extends TaskGoalProgressOutboxEventV2Base {
  action: 'revert';
  sources: TaskGoalSettlementSource[];
}

export type TaskGoalProgressOutboxEventV2 =
  | TaskGoalProgressApplyEventV2
  | TaskGoalProgressRevertEventV2;
