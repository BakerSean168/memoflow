import type {
  NotificationClientDTO,
  NotificationQuery,
} from '@memoflow/contracts/notification';
import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import type { INotificationRepository } from '../../domain/repositories';
import { toNotificationClientDTO } from '../use-cases/commands/notification-dto-converters';

export interface NotificationListQuery extends NotificationQuery {
  identityId: string;
}

export interface NotificationListPage {
  notifications: NotificationClientDTO[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const IMPORTANCE_ORDER: Record<string, number> = {
  Vital: 5,
  Important: 4,
  Moderate: 3,
  Minor: 2,
  Trivial: 1,
};

export class NotificationQueryApplicationService {
  constructor(private readonly notificationRepository: INotificationRepository) {}

  async listNotifications(query: NotificationListQuery): Promise<Result<NotificationListPage>> {
    if (!query.identityId) {
      return fail({
        code: 'BAD_REQUEST',
        message: 'identityId is required for listing notifications / 列出通知需要 identityId',
      });
    }

    const page = query.page ?? 1;
    const pageSize = query.limit ?? 20;
    const offset = Math.max((page - 1) * pageSize, 0);
    const archiveState = query.archiveState ?? 'active';

    const notifications = query.relatedEntityType && query.relatedEntityId
      ? await this.notificationRepository.findByRelatedEntity(
          query.identityId,
          query.relatedEntityType,
          query.relatedEntityId,
          { archiveState },
        )
      : await this.notificationRepository.findByIdentityId(query.identityId, {
          includeDeleted: false,
          includeRead: query.isRead === false ? false : true,
          archiveState,
        });

    const filtered = notifications
      .map((notification) => toNotificationClientDTO(notification.toServerDTO()))
      .filter((notification) => notification.identityId === query.identityId)
      .filter((notification) => notification.deletedAt === null)
      .filter((notification) => archiveState === 'all' || (archiveState === 'archived' ? notification.archivedAt !== null : notification.archivedAt === null))
      .filter((notification) => query.isRead === undefined || notification.isRead === query.isRead)
      .filter((notification) => !query.type || notification.type === query.type)
      .filter((notification) => !query.category || notification.category === query.category)
      .filter((notification) => !query.workflowKey || notification.workflowKey === query.workflowKey)
      .filter((notification) => !query.topic || notification.topic === query.topic)
      .filter((notification) => this.matchesKeyword(notification, query.keyword))
      .filter((notification) => query.startDate === undefined || notification.createdAt >= query.startDate)
      .filter((notification) => query.endDate === undefined || notification.createdAt <= query.endDate)
      .sort((left, right) => this.compareNotifications(left, right, query.sortBy, query.sortOrder));

    const pagedNotifications = filtered.slice(offset, offset + pageSize);

    return ok({
      notifications: pagedNotifications,
      total: filtered.length,
      page,
      pageSize,
      hasMore: offset + pagedNotifications.length < filtered.length,
    });
  }

  async getNotification(id: string, identityId: string): Promise<Result<NotificationClientDTO>> {
    const notification = await this.notificationRepository.findByIdForIdentity(identityId, id);
    if (!notification) {
      return fail({ code: 'NOT_FOUND', message: 'notification not found' });
    }

    return ok(toNotificationClientDTO(notification.toServerDTO()));
  }

  private matchesKeyword(notification: NotificationClientDTO, keyword?: string): boolean {
    if (!keyword) {
      return true;
    }

    const normalized = keyword.trim().toLowerCase();
    if (!normalized) {
      return true;
    }

    return notification.title.toLowerCase().includes(normalized)
      || notification.content.toLowerCase().includes(normalized);
  }

  private compareNotifications(
    left: NotificationClientDTO,
    right: NotificationClientDTO,
    sortBy: NotificationQuery['sortBy'],
    sortOrder: NotificationQuery['sortOrder'],
  ): number {
    const direction = sortOrder === 'asc' ? 1 : -1;
    const leftValue = this.getSortValue(left, sortBy);
    const rightValue = this.getSortValue(right, sortBy);

    if (leftValue === rightValue) {
      return direction * (left.createdAt - right.createdAt);
    }

    return leftValue > rightValue ? direction : -direction;
  }

  private getSortValue(
    notification: NotificationClientDTO,
    sortBy: NotificationQuery['sortBy'],
  ): number {
    switch (sortBy) {
      case 'updatedAt':
        return notification.updatedAt;
      case 'importance':
        return IMPORTANCE_ORDER[notification.importance] ?? 0;
      case 'urgency':
        return notification.updatedAt;
      case 'createdAt':
      default:
        return notification.createdAt;
    }
  }
}