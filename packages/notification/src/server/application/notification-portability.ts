import { createHash } from 'node:crypto';
import type {
  NotificationPortableFactV3,
  NotificationPortableInteractionV3,
  NotificationPortablePayloadV3,
} from '@memoflow/contracts/notification';
import {
  NotificationActionIntentSchema,
  NotificationPortablePayloadV3Schema,
} from '@memoflow/contracts/notification';
import type {
  PortableCapability,
  PortableCapabilityExecutionContext,
  PortableCapabilityReceipt,
  PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import type { INotificationInteractionRepository, INotificationRepository } from '../domain/repositories';
import { Notification } from '../domain/aggregates/notification';
import { NotificationId, NotificationAction, NotificationMetadata } from '../domain/value-objects';

function stableUuid(seed: string): string {
  const hex = createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function requireBatchId(context: PortableCapabilityExecutionContext): string {
  if (!context.batchId) throw new Error('notifications@3 requires a portability batch id');
  return context.batchId;
}

function deterministicNotificationId(
  context: PortableCapabilityExecutionContext,
  ref: PortableReferenceV3,
): string {
  return `INotificationId_${stableUuid(
    `portable:${context.identityId}:${requireBatchId(context)}:notification:${ref}`,
  )}`;
}

function importedNotificationKey(
  context: PortableCapabilityExecutionContext,
  ref: PortableReferenceV3,
): string {
  return `portable:${context.identityId}:${requireBatchId(context)}:notification:${ref}`;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function portableFactSortKey(notification: Notification): string {
  return JSON.stringify({ ...portableFact('notifications:1', notification), ref: undefined });
}

type PortableInteractionSortInput = Omit<NotificationPortableInteractionV3, 'ref'>;

function portableInteractionSortKey(interaction: PortableInteractionSortInput): string {
  return JSON.stringify([
    interaction.notificationRef,
    interaction.actionKey,
    interaction.actionKind,
    interaction.occurredAt,
    interaction.commandReceiptId,
    interaction.outcome,
    interaction.correlationId,
    interaction.causationId,
  ]);
}

function portableFact(
  ref: PortableReferenceV3,
  notification: Notification,
): NotificationPortableFactV3 {
  const dto = notification.toServerDTO();
  const metadata = dto.metadata
    ? { icon: dto.metadata.icon, image: dto.metadata.image, color: dto.metadata.color }
    : null;
  return {
    ref,
    workflowKey: dto.workflowKey,
    topic: dto.topic,
    title: dto.title,
    content: dto.content,
    type: dto.type,
    category: dto.category,
    importance: dto.importance,
    urgency: dto.urgency,
    relatedEntityType: dto.relatedEntityType ?? null,
    relatedEntityId: dto.relatedEntityId ?? null,
    navigationIntent: dto.navigationIntent ?? null,
    actions: dto.actions
      ? dto.actions.map((action) => NotificationActionIntentSchema.parse(action))
      : null,
    presentation: metadata,
    correlationId: dto.correlationId ?? null,
    causationId: dto.causationId ?? null,
    readAt: dto.readAt ?? null,
    archivedAt: dto.archivedAt ?? null,
    expiresAt: dto.expiresAt ?? null,
  };
}

function assertFactMatches(
  current: Notification,
  incoming: NotificationPortableFactV3,
): void {
  if (current.toServerDTO().deletedAt !== null || !same(portableFact(incoming.ref, current), incoming)) {
    throw new Error(`notifications@3 deterministic target conflicts with portable Fact ${incoming.ref}`);
  }
}

function assertInteractionMatches(
  current: Awaited<ReturnType<INotificationInteractionRepository['findByIdempotencyKey']>>,
  incoming: NotificationPortableInteractionV3,
  notificationId: string,
): void {
  if (
    !current ||
    current.notificationId !== notificationId ||
    current.actionKey !== incoming.actionKey ||
    current.actionKind !== incoming.actionKind ||
    current.occurredAt !== incoming.occurredAt ||
    (current.commandReceiptId ?? null) !== incoming.commandReceiptId ||
    current.outcome !== incoming.outcome ||
    (current.correlationId ?? null) !== incoming.correlationId ||
    (current.causationId ?? null) !== incoming.causationId
  ) {
    throw new Error(`notifications@3 interaction target conflicts with portable Interaction ${incoming.ref}`);
  }
}

function validateInteractionAction(
  interaction: NotificationPortableInteractionV3,
  fact: NotificationPortableFactV3,
): void {
  const action = fact.actions?.find((candidate) => candidate.actionKey === interaction.actionKey);
  if (!action || action.kind !== interaction.actionKind) {
    throw new Error(
      `notifications@3 Interaction ${interaction.ref} references an unavailable typed action on ${fact.ref}`,
    );
  }
}

function validatePayloadReferences(payload: NotificationPortablePayloadV3): void {
  const factsByRef = new Map(payload.facts.map((fact) => [fact.ref, fact]));
  for (const interaction of payload.interactions) {
    const fact = factsByRef.get(interaction.notificationRef);
    if (!fact) {
      throw new Error(`notifications@3 Interaction has unknown Fact: ${interaction.notificationRef}`);
    }
    validateInteractionAction(interaction, fact);
  }
}

function createImportedNotification(
  context: PortableCapabilityExecutionContext,
  fact: NotificationPortableFactV3,
  id: string,
): Notification {
  return Notification.load({
    id: NotificationId.of(id),
    identityId: context.identityId as never,
    workflowKey: fact.workflowKey,
    topic: fact.topic,
    idempotencyKey: importedNotificationKey(context, fact.ref),
    title: fact.title,
    content: fact.content,
    type: fact.type,
    category: fact.category,
    importance: fact.importance,
    urgency: fact.urgency,
    relatedEntityType: fact.relatedEntityType,
    relatedEntityId: fact.relatedEntityId,
    navigationIntent: fact.navigationIntent,
    correlationId: fact.correlationId,
    causationId: fact.causationId,
    isRead: fact.readAt !== null,
    readAt: fact.readAt,
    actions: fact.actions?.map((action) => NotificationAction.fromDTO(action)) ?? null,
    metadata: fact.presentation
      ? NotificationMetadata.fromDTO({
          icon: fact.presentation.icon,
          image: fact.presentation.image,
          color: fact.presentation.color,
          sound: null,
          badge: null,
        })
      : null,
    expiresAt: fact.expiresAt,
    version: 1,
    deletedAt: null,
    archivedAt: fact.archivedAt === null ? null : new Date(fact.archivedAt),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

/** Owner-owned V3 capability for Notification Fact/Inbox and typed Interaction. */
export class NotificationPortableCapability implements PortableCapability<NotificationPortablePayloadV3> {
  readonly key = 'notifications' as const;
  readonly schemaVersion = 3;
  readonly dependsOn = [] as const;
  readonly payloadSchema = NotificationPortablePayloadV3Schema;

  constructor(
    private readonly notificationRepository: INotificationRepository,
    private readonly interactionRepository: INotificationInteractionRepository,
  ) {}

  async export(context: PortableCapabilityExecutionContext): Promise<NotificationPortablePayloadV3> {
    const notifications = await this.notificationRepository.findByIdentityId(context.identityId, {
      includeRead: true,
      includeDeleted: false,
      archiveState: 'all',
    });
    const ordered = notifications
      .slice()
      .sort((a, b) => portableFactSortKey(a).localeCompare(portableFactSortKey(b)));
    const refs = new Map<string, PortableReferenceV3>();
    const facts = ordered.map((notification) => {
      const ref = context.references.declareExportReference(this.key, String(notification.id));
      refs.set(String(notification.id), ref);
      return portableFact(ref, notification);
    });

    const interactions: NotificationPortableInteractionV3[] = [];
    for (const notification of ordered) {
      const notificationRef = refs.get(String(notification.id));
      if (!notificationRef) throw new Error(`notifications@3 missing Fact reference: ${String(notification.id)}`);
      const current = await this.interactionRepository.listByNotification(
        context.identityId,
        String(notification.id),
      );
      const portableForNotification = current.map((item) => ({
        sourceId: String(item.id),
        notificationRef,
        actionKey: item.actionKey,
        actionKind: item.actionKind,
        occurredAt: item.occurredAt,
        commandReceiptId: item.commandReceiptId ?? null,
        outcome: item.outcome,
        correlationId: item.correlationId ?? null,
        causationId: item.causationId ?? null,
      }));
      for (const interaction of portableForNotification.sort((a, b) =>
        portableInteractionSortKey(a).localeCompare(portableInteractionSortKey(b)),
      )) {
        interactions.push({
          ref: context.references.declareExportReference(this.key, interaction.sourceId),
          notificationRef: interaction.notificationRef,
          actionKey: interaction.actionKey,
          actionKind: interaction.actionKind,
          occurredAt: interaction.occurredAt,
          commandReceiptId: interaction.commandReceiptId,
          outcome: interaction.outcome,
          correlationId: interaction.correlationId,
          causationId: interaction.causationId,
        });
      }
    }

    return NotificationPortablePayloadV3Schema.parse({ facts, interactions });
  }

  async validateImport(
    payload: NotificationPortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<void> {
    const target = NotificationPortablePayloadV3Schema.parse(payload);
    validatePayloadReferences(target);
    await this.dryRun(target, context);
  }

  async dryRun(
    payload: NotificationPortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const target = NotificationPortablePayloadV3Schema.parse(payload);
    validatePayloadReferences(target);
    let created = 0;
    let skipped = 0;
    const idsByRef = new Map<PortableReferenceV3, string>();
    for (const fact of target.facts) {
      const deterministicId = deterministicNotificationId(context, fact.ref);
      const currentById = await this.notificationRepository.findByIdForIdentity(
        context.identityId,
        deterministicId,
      );
      const current =
        currentById ??
        (await this.notificationRepository.findByIdempotencyKey(
          context.identityId,
          importedNotificationKey(context, fact.ref),
        ));
      if (current) {
        assertFactMatches(current, fact);
        idsByRef.set(fact.ref, String(current.id));
        skipped += 1;
      } else {
        idsByRef.set(fact.ref, deterministicId);
        created += 1;
      }
      context.references.bindImportedReference(fact.ref, idsByRef.get(fact.ref)!);
    }
    for (const interaction of target.interactions) {
      const notificationId = idsByRef.get(interaction.notificationRef);
      if (!notificationId) {
        throw new Error(`notifications@3 Interaction has an unbound Fact reference: ${interaction.notificationRef}`);
      }
      const current = await this.interactionRepository.findByIdempotencyKey(
        context.identityId,
        `${importedNotificationKey(context, interaction.ref)}:interaction`,
      );
      if (current) {
        assertInteractionMatches(current, interaction, notificationId);
        skipped += 1;
      } else {
        created += 1;
      }
      context.references.bindImportedReference(interaction.ref, current?.id ?? `portable-interaction:${interaction.ref}`);
    }
    return {
      created,
      updated: 0,
      skipped,
      warnings: ['Delivery outbox, receipts, dead letters, audit, and device state are not portable.'],
    };
  }

  async apply(
    payload: NotificationPortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const target = NotificationPortablePayloadV3Schema.parse(payload);
    validatePayloadReferences(target);
    let created = 0;
    let skipped = 0;
    const idsByRef = new Map<PortableReferenceV3, string>();
    for (const fact of target.facts) {
      const deterministicId = deterministicNotificationId(context, fact.ref);
      const currentById = await this.notificationRepository.findByIdForIdentity(
        context.identityId,
        deterministicId,
      );
      const current =
        currentById ??
        (await this.notificationRepository.findByIdempotencyKey(
          context.identityId,
          importedNotificationKey(context, fact.ref),
        ));
      if (current) {
        assertFactMatches(current, fact);
        idsByRef.set(fact.ref, String(current.id));
        skipped += 1;
      } else {
        const notification = createImportedNotification(context, fact, deterministicId);
        await this.notificationRepository.save(notification);
        idsByRef.set(fact.ref, deterministicId);
        created += 1;
      }
      context.references.bindImportedReference(fact.ref, idsByRef.get(fact.ref)!);
    }

    for (const interaction of target.interactions) {
      const notificationId = idsByRef.get(interaction.notificationRef);
      if (!notificationId) {
        throw new Error(`notifications@3 Interaction has an unbound Fact reference: ${interaction.notificationRef}`);
      }
      const idempotencyKey = `${importedNotificationKey(context, interaction.ref)}:interaction`;
      const current = await this.interactionRepository.findByIdempotencyKey(
        context.identityId,
        idempotencyKey,
      );
      if (current) {
        assertInteractionMatches(current, interaction, notificationId);
        skipped += 1;
        context.references.bindImportedReference(interaction.ref, String(current.id));
        continue;
      }
      const createdInteraction = await this.interactionRepository.record({
        idempotencyKey,
        identityId: context.identityId,
        notificationId,
        actionKey: interaction.actionKey,
        actionKind: interaction.actionKind,
        occurredAt: interaction.occurredAt,
        commandReceiptId: interaction.commandReceiptId,
        outcome: interaction.outcome,
        correlationId: interaction.correlationId,
        causationId: interaction.causationId,
      });
      created += 1;
      context.references.bindImportedReference(interaction.ref, String(createdInteraction.id));
    }

    return {
      created,
      updated: 0,
      skipped,
      warnings: ['Delivery outbox, receipts, dead letters, audit, and device state are not portable.'],
    };
  }
}

export function createNotificationPortableCapability(
  notificationRepository: INotificationRepository,
  interactionRepository: INotificationInteractionRepository,
): NotificationPortableCapability {
  return new NotificationPortableCapability(notificationRepository, interactionRepository);
}
