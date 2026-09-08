import {
  TaskGoalSettlementSourceType,
  type TaskGoalProgressOutboxEventV2,
  type TaskGoalSettlementSource,
} from '@memoflow/contracts/task';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('TaskGoalOutboxDispatcher');

export interface PendingTaskGoalOutboxEvent {
  eventId: string;
  /** Raw persistence payload; decoded only at the application boundary. */
  payload: string;
}

/** Dedicated persistence port for Task → Goal delivery; not a generic bus. */
export interface TaskGoalOutboxDispatchStore {
  claimPending(limit: number): Promise<PendingTaskGoalOutboxEvent[]>;
  markDelivered(eventId: string): Promise<void>;
  markRetry(eventId: string, error: string): Promise<void>;
  replayDeadLetter(eventId: string): Promise<boolean>;
}

export interface TaskGoalProgressHandler {
  handle(event: TaskGoalProgressOutboxEventV2): Promise<void>;
}

export class TaskGoalOutboxDispatcher {
  constructor(
    private readonly store: TaskGoalOutboxDispatchStore,
    private readonly handler: TaskGoalProgressHandler,
  ) {}

  async dispatchPending(limit = 100): Promise<void> {
    const pending = await this.store.claimPending(limit);
    if (pending.length > 0) {
      logger.info('[TaskGoalOutboxDispatcher] Claimed delivery batch', { count: pending.length });
    }
    for (const event of pending) {
      try {
        await this.handler.handle(decodeTaskGoalProgressEvent(event.eventId, event.payload));
        await this.store.markDelivered(event.eventId);
        logger.info('[TaskGoalOutboxDispatcher] Delivery completed', { eventId: event.eventId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.store.markRetry(event.eventId, message);
        logger.error('[TaskGoalOutboxDispatcher] Delivery scheduled for retry', {
          eventId: event.eventId,
          error: message,
        });
      }
    }
  }
}

function decodeTaskGoalProgressEvent(
  claimedEventId: string,
  serialized: string,
): TaskGoalProgressOutboxEventV2 {
  const value: unknown = JSON.parse(serialized);
  if (!isRecord(value)) throw new Error('Task -> Goal payload must be an object');
  if (value.eventId !== claimedEventId) throw new Error('Task -> Goal eventId mismatch');
  if (value.schemaVersion !== 2 || value.eventType !== 'task.goal-progress-requested') {
    throw new Error('Unsupported Task -> Goal event contract');
  }
  for (const field of ['identityId', 'taskOccurrenceId', 'taskPlanId'] as const) {
    requireNonEmptyString(value[field], `Task -> Goal ${field}`);
  }
  if (!Number.isFinite(value.occurredAt)) {
    throw new Error('Task -> Goal payload contains an invalid occurredAt');
  }

  if (value.action === 'apply') {
    for (const field of ['goalId', 'keyResultId', 'taskTitle'] as const) {
      requireNonEmptyString(value[field], `Task -> Goal ${field}`);
    }
    if (!Number.isFinite(value.value) || Number(value.value) <= 0) {
      throw new Error('Task -> Goal apply payload contains an invalid contribution value');
    }
    requireSettlementSource(value.source);
    return value as unknown as TaskGoalProgressOutboxEventV2;
  }

  if (value.action === 'revert') {
    if (!Array.isArray(value.sources) || value.sources.length === 0) {
      throw new Error('Task -> Goal revert payload requires explicit sources');
    }
    value.sources.forEach(requireSettlementSource);
    return value as unknown as TaskGoalProgressOutboxEventV2;
  }

  throw new Error('Task -> Goal payload contains an invalid action');
}

function requireSettlementSource(value: unknown): asserts value is TaskGoalSettlementSource {
  if (!isRecord(value)) throw new Error('Task -> Goal settlement source must be an object');
  if (!Object.values(TaskGoalSettlementSourceType).includes(value.type as never)) {
    throw new Error('Task -> Goal settlement source type is invalid');
  }
  requireNonEmptyString(value.id, 'Task -> Goal settlement source id');
}

function requireNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
