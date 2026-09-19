import { randomUUID } from 'node:crypto';
import {
  assertValidBusinessOperationReceipt,
  buildIdempotencyKeyString,
  type BusinessOperationReceipt,
} from '@memoflow/contracts/reliable-messaging';
import {
  NotificationCategory,
  NotificationChannelType,
  NotificationType,
  type NotificationRequestedOutboxInput,
} from '@memoflow/contracts/notification';
import type {
  RoutineOccurrenceNotificationRequestInput,
  RoutineOccurrenceNotificationWriterPort,
} from '../../domain/ports/routine-occurrence-notification-writer.port';

export const ROUTINE_NOTIFICATION_SOURCE = 'routine';

/** Durable `notification.requested` envelope for one committed routine occurrence. */
export function buildRoutineNotificationRequestedOutboxInput(
  input: RoutineOccurrenceNotificationRequestInput,
  options?: { operationIdFactory?: () => string },
): NotificationRequestedOutboxInput {
  const operationId =
    input.operationId ?? options?.operationIdFactory?.() ?? `routine-requested:${randomUUID()}`;
  const idempotencyKey = buildIdempotencyKeyString({
    identityId: input.identityId,
    source: ROUTINE_NOTIFICATION_SOURCE,
    occurrenceKey: input.occurrenceKey,
  });
  return {
    operationId,
    envelope: {
      identityId: input.identityId,
      source: ROUTINE_NOTIFICATION_SOURCE,
      occurrenceKey: input.occurrenceKey,
      idempotencyKey,
      workflowKey: 'routine.intervention',
      relatedEntity: { type: 'routine', id: input.routineId },
      content: {
        title: input.title,
        content: input.content,
        type: NotificationType.Reminder,
        category: NotificationCategory.Reminder,
      },
      suggestedChannels: [NotificationChannelType.InApp],
      actions: [
        {
          kind: 'owner-command',
          actionKey: 'complete',
          labelKey: 'routine.action.complete',
          owner: { type: 'routine-occurrence', id: input.occurrenceKey },
          commandKey: 'routine.complete',
          input: {
            routineId: input.routineId,
            occurrenceKey: input.occurrenceKey,
          },
        },
        {
          kind: 'owner-command',
          actionKey: 'snooze-10m',
          labelKey: 'routine.action.snooze10m',
          owner: { type: 'routine-occurrence', id: input.occurrenceKey },
          commandKey: 'routine.snooze',
          input: {
            routineId: input.routineId,
            occurrenceKey: input.occurrenceKey,
            durationMs: 600000,
          },
        },
        {
          kind: 'archive',
          actionKey: 'archive',
          labelKey: 'notification.action.archive',
        },
      ],
      correlationId: operationId,
      causationId: operationId,
    },
  };
}

/**
 * In-memory NotificationRequested writer honoring the durable envelope's
 * idempotency key. A replay of the same envelope is a no-op that returns the
 * stable receipt — the assertion used by crash/retry no-duplicate tests.
 */
export function createInMemoryRoutineNotificationWriter(options?: {
  readonly now?: () => number;
}): RoutineOccurrenceNotificationWriterPort & {
  readonly rows: readonly NotificationRequestedOutboxInput[];
} {
  const now = options?.now ?? Date.now;
  const rows: NotificationRequestedOutboxInput[] = [];
  return {
    rows,
    async enqueueRoutineOccurrenceRequested(input) {
      const envelope = buildRoutineNotificationRequestedOutboxInput(input);
      const existing = rows.find((row) => row.envelope.idempotencyKey === envelope.envelope.idempotencyKey);
      if (existing) {
        return toReceipt(existing, now());
      }
      rows.push(envelope);
      return toReceipt(envelope, now());
    },
  };
}

function toReceipt(row: NotificationRequestedOutboxInput, finishedAt: number): BusinessOperationReceipt {
  return assertValidBusinessOperationReceipt({
    schemaVersion: 1,
    operationId: row.operationId,
    identityId: row.envelope.identityId,
    source: row.envelope.source,
    occurrenceKey: row.envelope.occurrenceKey,
    idempotencyKey: row.envelope.idempotencyKey,
    status: 'succeeded',
    attempt: 1,
    lease: null,
    lastError: null,
    nextRetryAt: null,
    deadLetterAt: null,
    correlationId: row.correlationId ?? null,
    causationId: row.causationId ?? null,
    attemptsHistory: [],
    createdAt: new Date(finishedAt).toISOString(),
    updatedAt: new Date(finishedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
  });
}