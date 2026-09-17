import type {
  NotificationServerDTO,
  NotificationActionDTO,
  NotificationMetadataDTO,
  NotificationNavigationIntentDTO,
  NotificationEventMap,
  NotificationType,
  NotificationCategory,
} from '@memoflow/contracts/notification';
import type { IdentityId, NotificationId as NotificationIdBranded } from '@memoflow/contracts/primitives';
import { ImportanceLevel, UrgencyLevel } from '@memoflow/contracts/shared';
import { AggregateRoot } from '@memoflow/utils/domain';
import {
  NotificationId,
  NotificationAction,
  NotificationMetadata,
} from '../value-objects';

export interface NotificationState {
  id: NotificationId;
  identityId: IdentityId;
  workflowKey: string;
  topic: string;
  idempotencyKey: string;
  title: string;
  content: string;
  type: NotificationType;
  category: NotificationCategory;
  importance: ImportanceLevel;
  urgency: UrgencyLevel;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  navigationIntent: NotificationNavigationIntentDTO | null;
  correlationId: string | null;
  causationId: string | null;
  isRead: boolean;
  readAt: number | null;
  actions: NotificationAction[] | null;
  metadata: NotificationMetadata | null;
  expiresAt: number | null;
  version: number;
  deletedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function cloneNavigationIntent(
  navigationIntent: NotificationNavigationIntentDTO | null,
): NotificationNavigationIntentDTO | null {
  if (!navigationIntent) return null;
  return {
    ...navigationIntent,
    params: navigationIntent.params ? { ...navigationIntent.params } : undefined,
  };
}

/** Durable user-visible Notification Fact. Delivery lifecycle is not root state. */
export class Notification extends AggregateRoot<NotificationId> {
  private _props: NotificationState;

  private constructor(state: NotificationState) {
    super(state.id);
    this._props = {
      ...state,
      navigationIntent: cloneNavigationIntent(state.navigationIntent),
    };
  }

  get identityId(): IdentityId { return this._props.identityId; }
  get workflowKey(): string { return this._props.workflowKey; }
  get topic(): string { return this._props.topic; }
  get idempotencyKey(): string { return this._props.idempotencyKey; }
  get title(): string { return this._props.title; }
  get content(): string { return this._props.content; }
  get type(): NotificationType { return this._props.type; }
  get category(): NotificationCategory { return this._props.category; }
  get importance(): ImportanceLevel { return this._props.importance; }
  get urgency(): UrgencyLevel { return this._props.urgency; }
  get relatedEntityType(): string | null { return this._props.relatedEntityType; }
  get relatedEntityId(): string | null { return this._props.relatedEntityId; }
  get navigationIntent(): NotificationNavigationIntentDTO | null {
    return cloneNavigationIntent(this._props.navigationIntent);
  }
  get correlationId(): string | null { return this._props.correlationId; }
  get causationId(): string | null { return this._props.causationId; }
  get isRead(): boolean { return this._props.readAt !== null; }
  get readAt(): number | null { return this._props.readAt; }
  get actions(): NotificationAction[] | null { return this._props.actions ? [...this._props.actions] : null; }
  get metadata(): NotificationMetadata | null { return this._props.metadata; }
  get expiresAt(): number | null { return this._props.expiresAt; }
  get version(): number { return this._props.version; }
  get deletedAt(): Date | null { return this._props.deletedAt; }
  get archivedAt(): Date | null { return this._props.archivedAt; }
  get createdAt(): Date { return this._props.createdAt; }
  get updatedAt(): Date { return this._props.updatedAt; }

  markAsRead(now: Date = new Date()): void {
    if (this._props.readAt !== null) return;
    this._props.readAt = now.getTime();
    this._props.isRead = true;
    this._props.updatedAt = now;
    this.addDomainEvent<NotificationEventMap['notification:read']>('notification:read', {
      identityId: this._props.identityId,
      notificationId: this.id as NotificationIdBranded,
      notification: this.toServerDTO(),
      readAt: this._props.readAt,
    });
  }

  markAsUnread(now: Date = new Date()): void {
    if (this._props.readAt === null) return;
    this._props.isRead = false;
    this._props.readAt = null;
    this._props.updatedAt = now;
    this.addDomainEvent<NotificationEventMap['notification:unread']>('notification:unread', {
      identityId: this._props.identityId,
      notificationId: this.id as NotificationIdBranded,
      notification: this.toServerDTO(),
    });
  }

  archive(now: Date = new Date()): void {
    if (this._props.archivedAt !== null || this._props.deletedAt !== null) return;
    this._props.archivedAt = now;
    this._props.updatedAt = now;
    this.addDomainEvent<NotificationEventMap['notification:archived']>('notification:archived', {
      identityId: this._props.identityId,
      notificationId: this.id as NotificationIdBranded,
      notification: this.toServerDTO(),
      archivedAt: now.getTime(),
    });
  }

  restore(now: Date = new Date()): void {
    if (this._props.archivedAt === null || this._props.deletedAt !== null) return;
    this._props.archivedAt = null;
    this._props.updatedAt = now;
    this.addDomainEvent<NotificationEventMap['notification:restored']>('notification:restored', {
      identityId: this._props.identityId,
      notificationId: this.id as NotificationIdBranded,
      notification: this.toServerDTO(),
    });
  }

  hasBeenRead(): boolean { return this._props.readAt !== null; }

  softDelete(now: Date = new Date()): void {
    if (this._props.deletedAt) return;
    this._props.deletedAt = now;
    this._props.updatedAt = now;
    this.addDomainEvent<NotificationEventMap['notification:deleted']>('notification:deleted', {
      identityId: this._props.identityId,
      notificationId: this.id as NotificationIdBranded,
      notification: this.toServerDTO(),
      isSoftDelete: true,
      deletedAt: this._props.deletedAt.getTime(),
    });
  }


  toServerDTO(): NotificationServerDTO {
    return {
      id: this.id as NotificationIdBranded,
      identityId: this._props.identityId,
      workflowKey: this._props.workflowKey,
      topic: this._props.topic,
      idempotencyKey: this._props.idempotencyKey,
      title: this._props.title,
      content: this._props.content,
      type: this._props.type,
      category: this._props.category,
      importance: this._props.importance,
      urgency: this._props.urgency,
      relatedEntityType: this._props.relatedEntityType,
      relatedEntityId: this._props.relatedEntityId,
      navigationIntent: cloneNavigationIntent(this._props.navigationIntent),
      correlationId: this._props.correlationId,
      causationId: this._props.causationId,
      isRead: this._props.readAt !== null,
      readAt: this._props.readAt,
      actions: this._props.actions?.map((action) => action.toDTO()) ?? null,
      metadata: this._props.metadata?.toDTO() ?? null,
      expiresAt: this._props.expiresAt,
      version: this._props.version,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
      deletedAt: this._props.deletedAt?.getTime() ?? null,
      archivedAt: this._props.archivedAt?.getTime() ?? null,
    };
  }

  static load(state: NotificationState): Notification {
    return new Notification(state);
  }

  static create(params: {
    identityId: IdentityId;
    workflowKey: string;
    topic: string;
    idempotencyKey: string;
    title: string;
    content: string;
    type: NotificationType;
    category: NotificationCategory;
    importance?: ImportanceLevel;
    urgency?: UrgencyLevel;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
    actions?: NotificationActionDTO[];
    metadata?: NotificationMetadataDTO;
    navigationIntent?: NotificationNavigationIntentDTO | null;
    correlationId?: string | null;
    causationId?: string | null;
    expiresAt?: number | null;
  }): Notification {
    const id = NotificationId.of(NotificationId.generate());
    const now = new Date();
    const notification = new Notification({
      id,
      identityId: params.identityId,
      workflowKey: params.workflowKey,
      topic: params.topic,
      idempotencyKey: params.idempotencyKey,
      title: params.title,
      content: params.content,
      type: params.type,
      category: params.category,
      importance: params.importance ?? ImportanceLevel.Moderate,
      urgency: params.urgency ?? UrgencyLevel.Medium,
      relatedEntityType: params.relatedEntityType ?? null,
      relatedEntityId: params.relatedEntityId ?? null,
      navigationIntent: params.navigationIntent ?? null,
      correlationId: params.correlationId ?? null,
      causationId: params.causationId ?? null,
      isRead: false,
      readAt: null,
      actions: params.actions?.map((action) => NotificationAction.fromDTO(action)) ?? null,
      metadata: params.metadata ? NotificationMetadata.fromDTO(params.metadata) : null,
      expiresAt: params.expiresAt ?? null,
      version: 1,
      deletedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    notification.addDomainEvent<NotificationEventMap['notification:created']>('notification:created', {
      identityId: notification.identityId,
      notificationId: notification.id as NotificationIdBranded,
      notification: notification.toServerDTO(),
    });
    return notification;
  }
}
