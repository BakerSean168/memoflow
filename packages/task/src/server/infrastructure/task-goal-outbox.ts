import type { IDomainEvent } from '@memoflow/contracts/shared';
import {
  TaskGoalBindingTrigger,
  TaskGoalSettlementSourceType,
  TaskPlanOutcome,
  type TaskGoalProgressOutboxEventV2,
  type TaskInstanceCompletedEvent,
  type TaskPlanOutcomeChangedEvent,
  type TaskUncompletedEvent,
} from '@memoflow/contracts/task';

export interface TaskGoalOutboxRecord {
  eventId: string;
  identityId: string;
  taskInstanceId: string;
  taskTemplateId: string;
  goalId: string;
  keyResultId: string;
  payload: string;
  occurredAt: Date;
}

export interface TaskGoalOutboxWriter {
  append(record: TaskGoalOutboxRecord): Promise<void>;
}

/**
 * Converts eligible Task completion / correction events into the durable V2
 * settlement contract. Link-only Tasks deliberately return null on completion.
 */
export function toTaskGoalOutboxRecord(event: IDomainEvent): TaskGoalOutboxRecord | null {
  if (event.eventType === 'task:instance-uncompleted') {
    const payload = event.payload as TaskUncompletedEvent;
    const eventId = `task-goal-revert:instance:${String(payload.taskInstanceId)}:${payload.uncompletedAt}`;
    const durableEvent: TaskGoalProgressOutboxEventV2 = {
      eventId,
      schemaVersion: 2,
      eventType: 'task.goal-progress-requested',
      action: 'revert',
      identityId: payload.identityId,
      taskInstanceId: payload.taskInstanceId,
      taskTemplateId: payload.taskTemplateId,
      sources: [
        { type: TaskGoalSettlementSourceType.TaskInstance, id: String(payload.taskInstanceId) },
      ],
      occurredAt: payload.uncompletedAt,
    };

    return outboxRecord({
      eventId,
      identityId: String(payload.identityId),
      taskInstanceId: String(payload.taskInstanceId),
      taskTemplateId: String(payload.taskTemplateId),
      durableEvent,
      occurredAt: event.occurredAt,
    });
  }

  if (event.eventType === 'task:plan-outcome-changed') {
    return planOutcomeSettlementRecord(
      event.payload as TaskPlanOutcomeChangedEvent,
      event.occurredAt,
    );
  }

  if (event.eventType !== 'task:instance-completed') return null;

  const payload = event.payload as TaskInstanceCompletedEvent;
  const binding = payload.goalBinding;
  const contribution = binding?.contribution;
  if (
    !binding ||
    !contribution ||
    !binding.keyResultId ||
    contribution.trigger !== TaskGoalBindingTrigger.EachCompletion
  ) {
    return null;
  }

  const source = {
    type: TaskGoalSettlementSourceType.TaskInstance,
    id: String(payload.taskInstanceId),
  } as const;
  const eventId = `task-goal-apply:${source.type}:${source.id}:${payload.completedAt}`;
  const durableEvent: TaskGoalProgressOutboxEventV2 = {
    eventId,
    schemaVersion: 2,
    eventType: 'task.goal-progress-requested',
    action: 'apply',
    identityId: payload.identityId,
    taskInstanceId: payload.taskInstanceId,
    taskTemplateId: payload.taskTemplateId,
    goalId: binding.goalId,
    keyResultId: binding.keyResultId,
    value: contribution.value,
    source,
    taskTitle: payload.taskTitle,
    occurredAt: payload.completedAt,
  };

  return outboxRecord({
    eventId,
    identityId: String(payload.identityId),
    taskInstanceId: String(payload.taskInstanceId),
    taskTemplateId: String(payload.taskTemplateId),
    goalId: String(binding.goalId),
    keyResultId: String(binding.keyResultId),
    durableEvent,
    occurredAt: event.occurredAt,
  });
}

function planOutcomeSettlementRecord(
  payload: TaskPlanOutcomeChangedEvent,
  occurredAt: Date,
): TaskGoalOutboxRecord | null {
  const binding = payload.goalBinding;
  const contribution = binding?.contribution;
  if (
    !binding ||
    !contribution ||
    !binding.keyResultId ||
    contribution.trigger !== TaskGoalBindingTrigger.PlanCompletion ||
    payload.previousOutcome === payload.nextOutcome
  ) {
    return null;
  }

  if (payload.nextOutcome === TaskPlanOutcome.Succeeded) {
    const eventId = `task-goal-plan-apply:${String(payload.taskTemplateId)}:v${payload.planVersion}`;
    const durableEvent: TaskGoalProgressOutboxEventV2 = {
      eventId,
      schemaVersion: 2,
      eventType: 'task.goal-progress-requested',
      action: 'apply',
      identityId: payload.identityId,
      taskInstanceId: payload.triggeringTaskInstanceId,
      taskTemplateId: payload.taskTemplateId,
      goalId: binding.goalId,
      keyResultId: binding.keyResultId,
      value: contribution.value,
      source: {
        type: TaskGoalSettlementSourceType.TaskPlan,
        id: String(payload.taskTemplateId),
      },
      taskTitle: payload.taskTitle,
      occurredAt: payload.changedAt,
    };
    return outboxRecord({
      eventId,
      identityId: String(payload.identityId),
      taskInstanceId: String(payload.triggeringTaskInstanceId),
      taskTemplateId: String(payload.taskTemplateId),
      goalId: String(binding.goalId),
      keyResultId: String(binding.keyResultId),
      durableEvent,
      occurredAt,
    });
  }

  if (payload.previousOutcome === TaskPlanOutcome.Succeeded) {
    const eventId = `task-goal-plan-revert:${String(payload.taskTemplateId)}:v${payload.planVersion}`;
    const durableEvent: TaskGoalProgressOutboxEventV2 = {
      eventId,
      schemaVersion: 2,
      eventType: 'task.goal-progress-requested',
      action: 'revert',
      identityId: payload.identityId,
      taskInstanceId: payload.triggeringTaskInstanceId,
      taskTemplateId: payload.taskTemplateId,
      sources: [
        { type: TaskGoalSettlementSourceType.TaskPlan, id: String(payload.taskTemplateId) },
      ],
      occurredAt: payload.changedAt,
    };
    return outboxRecord({
      eventId,
      identityId: String(payload.identityId),
      taskInstanceId: String(payload.triggeringTaskInstanceId),
      taskTemplateId: String(payload.taskTemplateId),
      durableEvent,
      occurredAt,
    });
  }

  return null;
}

function outboxRecord(input: {
  eventId: string;
  identityId: string;
  taskInstanceId: string;
  taskTemplateId: string;
  goalId?: string;
  keyResultId?: string;
  durableEvent: TaskGoalProgressOutboxEventV2;
  occurredAt: Date;
}): TaskGoalOutboxRecord {
  return {
    eventId: input.eventId,
    identityId: input.identityId,
    taskInstanceId: input.taskInstanceId,
    taskTemplateId: input.taskTemplateId,
    goalId: input.goalId ?? '',
    keyResultId: input.keyResultId ?? '',
    payload: JSON.stringify(input.durableEvent),
    occurredAt: input.occurredAt,
  };
}
