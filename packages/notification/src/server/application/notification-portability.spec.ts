import { describe, expect, it, vi } from 'vitest';
import type {
  NotificationInteractionDTO,
} from '@memoflow/contracts/notification';
import type {
  PortableCapabilityExecutionContext,
  PortableReferencePort,
  PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import { Notification } from '../domain/aggregates/notification';
import type {
  INotificationInteractionRepository,
  INotificationRepository,
} from '../domain/repositories';
import { NotificationPortableCapability } from './notification-portability';

class FakeReferences implements PortableReferencePort {
  private next = 0;
  private readonly imports = new Map<PortableReferenceV3, string>();

  declareExportReference(capabilityKey: string, _sourceKey: string): PortableReferenceV3 {
    this.next += 1;
    return `${capabilityKey}:${this.next}` as PortableReferenceV3;
  }

  resolveExportReference(): PortableReferenceV3 {
    throw new Error('not used by notifications');
  }

  bindImportedReference(portableRef: PortableReferenceV3, targetKey: string): void {
    this.imports.set(portableRef, targetKey);
  }

  resolveImportedReference(portableRef: PortableReferenceV3): string {
    const value = this.imports.get(portableRef);
    if (!value) throw new Error(`missing import reference ${portableRef}`);
    return value;
  }
}

function context(references: PortableReferencePort): PortableCapabilityExecutionContext {
  return { identityId: 'identity-notification', batchId: 'batch-notification-v3', references };
}

function makeRepositories(initial: Notification[] = [], initialInteractions: NotificationInteractionDTO[] = []) {
  let notifications = [...initial];
  let interactions = [...initialInteractions];
  const notificationRepository = {
    findByIdentityId: vi.fn(async (identityId: string) =>
      notifications.filter((notification) => String(notification.identityId) === identityId),
    ),
    findByIdForIdentity: vi.fn(async (identityId: string, id: string) =>
      notifications.find(
        (notification) =>
          String(notification.identityId) === identityId && String(notification.id) === id,
      ) ?? null,
    ),
    findByIdempotencyKey: vi.fn(async (identityId: string, idempotencyKey: string) =>
      notifications.find(
        (notification) =>
          String(notification.identityId) === identityId && notification.idempotencyKey === idempotencyKey,
      ) ?? null,
    ),
    save: vi.fn(async (notification: Notification) => {
      notifications = [
        ...notifications.filter((current) => String(current.id) !== String(notification.id)),
        notification,
      ];
    }),
  } as unknown as INotificationRepository;
  const interactionRepository: INotificationInteractionRepository = {
    record: vi.fn(async (input) => {
      const interaction: NotificationInteractionDTO = {
        id: `interaction-${interactions.length + 1}` as never,
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
      interactions = [...interactions, interaction];
      return interaction;
    }),
    findByIdempotencyKey: vi.fn(async (identityId: string, idempotencyKey: string) =>
      interactions.find(
        (interaction) =>
          String(interaction.identityId) === identityId && interaction.idempotencyKey === idempotencyKey,
      ) ?? null,
    ),
    listByNotification: vi.fn(async (identityId: string, notificationId: string) =>
      interactions.filter(
        (interaction) =>
          String(interaction.identityId) === identityId &&
          String(interaction.notificationId) === notificationId,
      ),
    ),
  };
  return {
    notificationRepository,
    interactionRepository,
    get notifications() {
      return notifications;
    },
    get interactions() {
      return interactions;
    },
  };
}

function sourceNotification(): Notification {
  const notification = Notification.create({
    identityId: 'identity-notification' as never,
    workflowKey: 'routine.intervention',
    topic: 'routine.due',
    idempotencyKey: 'source-notification-key',
    title: 'Routine due',
    content: 'Take a short break',
    type: 'Reminder',
    category: 'Reminder',
    importance: 'Important',
    urgency: 'High',
    actions: [{ kind: 'archive', actionKey: 'archive', labelKey: 'archive' }],
    metadata: { icon: null, image: null, color: '#123456', sound: 'device-only', badge: 2 },
    correlationId: 'corr-1',
    causationId: 'cause-1',
    expiresAt: 1_758_100_000_000,
  });
  notification.markAsRead(new Date(1_758_000_001_000));
  notification.archive(new Date(1_758_000_002_000));
  return notification;
}

function sourceInteraction(notification: Notification): NotificationInteractionDTO {
  return {
    id: 'interaction-source' as never,
    idempotencyKey: 'source-interaction-key',
    identityId: 'identity-notification' as never,
    notificationId: notification.id as never,
    actionKey: 'archive',
    actionKind: 'archive',
    occurredAt: 1_758_000_002_000,
    commandReceiptId: null,
    outcome: 'accepted',
    correlationId: 'corr-1',
    causationId: 'cause-1',
  };
}

describe('NotificationPortableCapability', () => {
  it('round-trips durable Fact/Inbox and typed Interaction while excluding delivery/device state', async () => {
    const notification = sourceNotification();
    const sourceInteractionRecord = sourceInteraction(notification);
    const source = makeRepositories([notification], [sourceInteractionRecord]);
    const capability = new NotificationPortableCapability(
      source.notificationRepository,
      source.interactionRepository,
    );
    const payload = await capability.export(context(new FakeReferences()));

    expect(payload.facts).toHaveLength(1);
    expect(payload.interactions).toHaveLength(1);
    expect(payload.facts[0]).not.toHaveProperty('id');
    expect(payload.facts[0]).not.toHaveProperty('idempotencyKey');
    expect(payload.facts[0]?.presentation).toEqual({ icon: null, image: null, color: '#123456' });
    expect(payload.facts[0]).not.toHaveProperty('deliveryOutbox');

    const target = makeRepositories();
    const targetCapability = new NotificationPortableCapability(
      target.notificationRepository,
      target.interactionRepository,
    );
    await expect(targetCapability.dryRun(payload, context(new FakeReferences()))).resolves.toMatchObject({
      created: 2,
      skipped: 0,
    });
    await targetCapability.apply(payload, context(new FakeReferences()));
    const roundTripped = await targetCapability.export(context(new FakeReferences()));
    expect(roundTripped).toEqual(payload);
    expect(target.notifications[0]?.toServerDTO().metadata?.sound).toBeNull();
    expect(target.notifications[0]?.toServerDTO().metadata?.badge).toBeNull();
  });

  it('fails closed on unknown or incorrectly typed Interaction references', async () => {
    const capability = new NotificationPortableCapability(
      makeRepositories().notificationRepository,
      makeRepositories().interactionRepository,
    );
    const fact = {
      ref: 'notifications:1',
      workflowKey: 'workflow',
      topic: 'topic',
      title: 'Title',
      content: 'Content',
      type: 'Info',
      category: 'Other',
      importance: 'Moderate',
      urgency: 'None',
      relatedEntityType: null,
      relatedEntityId: null,
      navigationIntent: null,
      actions: [{ kind: 'archive', actionKey: 'archive', labelKey: 'archive' }],
      presentation: null,
      correlationId: null,
      causationId: null,
      readAt: null,
      archivedAt: null,
      expiresAt: null,
    } as const;
    const unknown = {
      facts: [fact],
      interactions: [
        {
          ref: 'notifications:2',
          notificationRef: 'notifications:99',
          actionKey: 'archive',
          actionKind: 'archive',
          occurredAt: 1,
          commandReceiptId: null,
          outcome: 'accepted',
          correlationId: null,
          causationId: null,
        },
      ],
    };
    await expect(capability.dryRun(unknown as never, context(new FakeReferences()))).rejects.toThrow(
      'unknown Fact',
    );

    const wrongActionKind = {
      ...unknown,
      interactions: [{ ...unknown.interactions[0], notificationRef: 'notifications:1', actionKind: 'navigate' }],
    };
    await expect(
      capability.dryRun(wrongActionKind as never, context(new FakeReferences())),
    ).rejects.toThrow('unavailable typed action');
  });
});
