import type {
  ExecuteNotificationActionRes,
  NotificationActionIntent,
} from '@memoflow/notification-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import { error, ok } from '@memoflow/transport-contracts/result';
import type {
  INotificationInteractionRepository,
  INotificationRepository,
} from '../../../domain/repositories';
import type { NotificationOwnerCommandPort } from '../../notification-owner-command.registry';

function interactionKey(notificationId: string, actionKey: string): string {
  return `notification:${notificationId}:action:${actionKey}`;
}

/**
 * Executes one typed Notification action without granting Notification generic
 * mutation authority. Owner commands are delegated to an explicit registry;
 * Notification records only surface provenance.
 */
export class ExecuteNotificationActionUseCase {
  constructor(
    private readonly notificationRepository: INotificationRepository,
    private readonly interactionRepository: INotificationInteractionRepository,
    private readonly ownerCommandPort: NotificationOwnerCommandPort,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: {
    readonly identityId: string;
    readonly notificationId: string;
    readonly actionKey: string;
    readonly snoozeDurationMs?: number;
  }): Promise<Result<ExecuteNotificationActionRes>> {
    const notification = await this.notificationRepository.findByIdForIdentity(
      input.identityId,
      input.notificationId,
    );
    if (!notification) return error('NOT_FOUND', 'Notification not found');

    let action = notification.actions
      ?.map((candidate) => candidate.toDTO())
      .find((candidate) => candidate.actionKey === input.actionKey);
    if (!action) return error('NOT_FOUND', 'Notification action not found');

    if (input.snoozeDurationMs != null) {
      if (!Number.isSafeInteger(input.snoozeDurationMs) || input.snoozeDurationMs <= 0 ||
        input.snoozeDurationMs > 31_536_000_000 || notification.workflowKey !== 'routine.intervention' ||
        action.kind !== 'owner-command' || action.commandKey !== 'routine.snooze' ||
        action.owner.type !== 'routine-occurrence' || !action.input ||
        typeof action.input !== 'object' || Array.isArray(action.input)) {
        return error('VALIDATION_ERROR', 'Only Routine snooze accepts a positive duration');
      }
      action = { ...action, input: { ...action.input, durationMs: input.snoozeDurationMs } };
    }
    const idempotencyKey = interactionKey(input.notificationId,
      input.snoozeDurationMs == null ? input.actionKey : `${input.actionKey}:${input.snoozeDurationMs}`);
    const existing = await this.interactionRepository.findByIdempotencyKey(
      input.identityId,
      idempotencyKey,
    );
    if (existing) return ok({ interaction: existing, action });

    const occurredAt = this.clock().getTime();
    let outcome: 'accepted' | 'rejected' | 'failed' = 'accepted';
    let commandReceiptId: string | null = null;

    try {
      if (action.kind === 'archive') {
        notification.archive(new Date(occurredAt));
        await this.notificationRepository.save(notification);
      } else if (action.kind === 'owner-command') {
        const receipt = await this.ownerCommandPort.execute({
          identityId: input.identityId,
          notificationId: input.notificationId,
          workflowKey: notification.workflowKey,
          action,
          idempotencyKey,
          correlationId: notification.correlationId,
          causationId: notification.causationId,
        });
        outcome = receipt.outcome;
        commandReceiptId = receipt.commandReceiptId ?? null;
      }

      const interaction = await this.interactionRepository.record({
        idempotencyKey,
        identityId: input.identityId,
        notificationId: input.notificationId,
        actionKey: action.actionKey,
        actionKind: action.kind,
        occurredAt,
        commandReceiptId,
        outcome,
        correlationId: notification.correlationId,
        causationId: notification.causationId,
      });
      return ok({ interaction, action });
    } catch (cause) {
      await this.interactionRepository.record({
        idempotencyKey,
        identityId: input.identityId,
        notificationId: input.notificationId,
        actionKey: action.actionKey,
        actionKind: action.kind,
        occurredAt,
        commandReceiptId,
        outcome: 'failed',
        correlationId: notification.correlationId,
        causationId: notification.causationId,
      });
      return error(
        'INTERNAL_ERROR',
        cause instanceof Error ? cause.message : 'Notification action execution failed',
      );
    }
  }
}

export type { NotificationActionIntent };
