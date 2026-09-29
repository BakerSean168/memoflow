import type { BusinessOperationReceipt } from '@memoflow/contracts/reliable-messaging';
import type { RoutineOccurrenceTransactionHandle } from './routine-occurrence-store.port';

export interface RoutineOccurrenceNotificationRequestInput {
  readonly identityId: string;
  readonly routineId: string;
  /** Canonical business occurrence targeted by Complete/Snooze actions. */
  readonly occurrenceKey: string;
  /**
   * Optional presentation-instance key used only for NotificationRequested
   * idempotency. Snooze wake-ups reuse the same business occurrence but must
   * create a new notification presentation exactly once.
   */
  readonly notificationOccurrenceKey?: string;
  readonly scheduledFor: number;
  readonly sourceRevision: string | number | null;
  readonly title: string;
  readonly content: string;
  readonly operationId?: string;
}

/**
 * Durable notification intent for a committed routine occurrence.
 *
 * The writer must enqueue a `notification.requested` envelope (NOTIF-3301)
 * idempotently keyed by
 * (identityId/source='routine'/notificationOccurrenceKey ?? occurrenceKey) so
 * a crash/retry replay never surfaces a duplicate notification while an
 * explicit snooze wake-up can present the SAME business occurrence again.
 * In production the
 * write joins the occurrence commit transaction via the shared transaction
 * handle (ROUTINE-3401 crash-window guard).
 */
export interface RoutineOccurrenceNotificationWriterPort {
  enqueueRoutineOccurrenceRequested(
    input: RoutineOccurrenceNotificationRequestInput,
    options?: { readonly transaction?: RoutineOccurrenceTransactionHandle },
  ): Promise<BusinessOperationReceipt>;
}
