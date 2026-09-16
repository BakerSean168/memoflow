import type {
  NotificationClientDTO,
  NotificationType,
  NotificationCategory,
  NotificationNavigationIntentDTO,
} from '@memoflow/contracts/notification';
import type { ImportanceLevel, UrgencyLevel } from '@memoflow/contracts/shared';
import { AggregateRoot } from '@memoflow/utils/domain';
import { NotificationId } from '../../server/domain/value-objects/notification-id';
import { IdentityId } from '@memoflow/domain-shared';
import type { NotificationId as NotificationIdBranded, IdentityId as IdentityIdBranded } from '@memoflow/contracts/primitives';
import { NotificationChannel } from '../entities/notification-channel.js';

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
  relatedEntityType?: NotificationClientDTO['relatedEntityType'];
  relatedEntityId?: string | null;
  navigationIntent?: NotificationNavigationIntentDTO | null;
  correlationId?: string | null;
  causationId?: string | null;
  readAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  notificationChannels: NotificationChannel[] | null;
}

export class Notification extends AggregateRoot<NotificationId> {
  private constructor(private readonly _props: NotificationState) { super(_props.id); }
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
  get isRead(): boolean { return this._props.readAt !== null; }
  get readAt(): Date | null { return this._props.readAt; }
  get version(): number { return this._props.version; }
  get createdAt(): Date { return this._props.createdAt; }
  get updatedAt(): Date { return this._props.updatedAt; }
  get deletedAt(): Date | null { return this._props.deletedAt; }
  get notificationChannels(): NotificationChannel[] | null { return this._props.notificationChannels; }
  get isDeleted(): boolean { return this._props.deletedAt !== null; }
  get hasActions(): boolean { return false; }
  get displayTitle(): string { return this._props.title; }

  static load(state: NotificationState): Notification { return new Notification(state); }

  toDTO(): NotificationClientDTO {
    return {
      id: this.id as unknown as NotificationIdBranded,
      identityId: this._props.identityId as unknown as IdentityIdBranded,
      workflowKey: this._props.workflowKey,
      topic: this._props.topic,
      idempotencyKey: this._props.idempotencyKey,
      title: this._props.title,
      content: this._props.content,
      type: this._props.type,
      category: this._props.category,
      importance: this._props.importance,
      urgency: this._props.urgency,
      relatedEntityType: this._props.relatedEntityType ?? null,
      relatedEntityId: this._props.relatedEntityId ?? null,
      navigationIntent: this._props.navigationIntent ?? null,
      correlationId: this._props.correlationId ?? null,
      causationId: this._props.causationId ?? null,
      isRead: this.isRead,
      readAt: this._props.readAt?.getTime() ?? null,
      actions: null,
      metadata: null,
      expiresAt: null,
      version: this._props.version,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
      deletedAt: this._props.deletedAt?.getTime() ?? null,
      archivedAt: null,
      notificationChannels: this._props.notificationChannels?.map((channel) => channel.toDTO()) ?? null,
    };
  }
}
