import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Notification } from '../../../../domain/aggregates/notification';
import type {
  INotificationInteractionRepository,
  INotificationRepository,
  RecordNotificationInteractionInput,
} from '../../../../domain/repositories';
import type { NotificationInteractionDTO } from '@memoflow/contracts/notification';
import { NotificationCategory, NotificationType } from '@memoflow/contracts/notification';
import { NotificationOwnerCommandRegistry } from '../../../notification-owner-command.registry';
import { ExecuteNotificationActionUseCase } from '../execute-notification-action.use-case';

function interactionFrom(input: RecordNotificationInteractionInput): NotificationInteractionDTO {
  return {
    id: 'interaction-1' as never,
    idempotencyKey: input.idempotencyKey,
    identityId: input.identityId as never,
    notificationId: input.notificationId as never,
    actionKey: input.actionKey,
    actionKind: input.actionKind,
    occurredAt: input.occurredAt,
    commandReceiptId: input.commandReceiptId ?? null,
    outcome: input.outcome,
    correlationId: input.correlationId ?? null,
    causationId: input.causationId ?? null,
  };
}

describe('ExecuteNotificationActionUseCase', () => {
  const identityId = 'identity-1';
  let notification: Notification;
  let notificationRepository: INotificationRepository;
  let interactionRepository: INotificationInteractionRepository;
  let registry: NotificationOwnerCommandRegistry;
  let stored: NotificationInteractionDTO | null;

  beforeEach(() => {
    stored = null;
    notification = Notification.create({
      identityId: identityId as never,
      workflowKey: 'routine.intervention',
      topic: 'routine.intervention',
      idempotencyKey: 'fact-1',
      title: 'Stand up',
      content: 'Move',
      type: NotificationType.Reminder,
      category: NotificationCategory.Reminder,
      correlationId: 'corr-1',
      causationId: 'cause-1',
      actions: [
        {
          kind: 'navigate',
          actionKey: 'open',
          labelKey: 'notification.action.open',
          destination: { route: '/routine' },
        },
        {
          kind: 'owner-command',
          actionKey: 'complete',
          labelKey: 'routine.action.complete',
          owner: { type: 'routine-occurrence', id: 'occ-1' },
          commandKey: 'routine.complete',
          input: { routineId: 'routine-1', occurrenceKey: 'occ-1' },
        },
        {
          kind: 'archive',
          actionKey: 'archive',
          labelKey: 'notification.action.archive',
        },
      ],
    });
    notificationRepository = {
      findByIdForIdentity: vi.fn(async () => notification),
      save: vi.fn(async () => undefined),
    } as unknown as INotificationRepository;
    interactionRepository = {
      findByIdempotencyKey: vi.fn(async () => stored),
      record: vi.fn(async (input) => {
        stored ??= interactionFrom(input);
        return stored;
      }),
      listByNotification: vi.fn(async () => stored ? [stored] : []),
    };
    registry = new NotificationOwnerCommandRegistry();
  });

  it('records navigation provenance without executing a business mutation', async () => {
    const useCase = new ExecuteNotificationActionUseCase(
      notificationRepository,
      interactionRepository,
      registry,
      () => new Date('2026-09-17T00:00:00Z'),
    );
    const result = await useCase.execute({ identityId, notificationId: String(notification.id), actionKey: 'open' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.interaction).toMatchObject({
      actionKey: 'open',
      actionKind: 'navigate',
      outcome: 'accepted',
    });
    expect(result.data.interaction.idempotencyKey).toBe(`notification:${notification.id}:action:open`);
  });

  it('routes an owner command through the explicit allowlist and persists only provenance', async () => {
    const execute = vi.fn(async () => ({ outcome: 'accepted' as const, commandReceiptId: 'routine-int-1' }));
    registry.register({
      workflowKey: 'routine.intervention',
      ownerType: 'routine-occurrence',
      commandKey: 'routine.complete',
      inputSchema: { parse: (value) => value },
      execute,
    });
    const useCase = new ExecuteNotificationActionUseCase(
      notificationRepository,
      interactionRepository,
      registry,
      () => new Date('2026-09-17T00:00:00Z'),
    );

    const result = await useCase.execute({
      identityId,
      notificationId: String(notification.id),
      actionKey: 'complete',
    });
    expect(result.ok).toBe(true);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      identityId,
      commandKey: 'routine.complete',
      idempotencyKey: `notification:${notification.id}:action:complete`,
    }));
    expect(stored).toMatchObject({ outcome: 'accepted', commandReceiptId: 'routine-int-1' });
  });

  it('fails closed for an unregistered owner command and records rejection', async () => {
    const useCase = new ExecuteNotificationActionUseCase(notificationRepository, interactionRepository, registry);
    const result = await useCase.execute({
      identityId,
      notificationId: String(notification.id),
      actionKey: 'complete',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.interaction.outcome).toBe('rejected');
  });

  it('replays the same mutation action from durable Interaction without invoking owner twice', async () => {
    const execute = vi.fn(async () => ({ outcome: 'accepted' as const, commandReceiptId: 'routine-int-1' }));
    registry.register({
      workflowKey: 'routine.intervention',
      ownerType: 'routine-occurrence',
      commandKey: 'routine.complete',
      execute,
    });
    const useCase = new ExecuteNotificationActionUseCase(notificationRepository, interactionRepository, registry);

    await useCase.execute({ identityId, notificationId: String(notification.id), actionKey: 'complete' });
    await useCase.execute({ identityId, notificationId: String(notification.id), actionKey: 'complete' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(interactionRepository.record).toHaveBeenCalledTimes(1);
  });

  it('archives through Notification owner lifecycle and records an Interaction fact', async () => {
    const useCase = new ExecuteNotificationActionUseCase(notificationRepository, interactionRepository, registry);
    const result = await useCase.execute({
      identityId,
      notificationId: String(notification.id),
      actionKey: 'archive',
    });
    expect(result.ok).toBe(true);
    expect(notification.archivedAt).not.toBeNull();
    expect(notificationRepository.save).toHaveBeenCalledWith(notification);
    expect(stored).toMatchObject({ actionKind: 'archive', outcome: 'accepted' });
  });
});
