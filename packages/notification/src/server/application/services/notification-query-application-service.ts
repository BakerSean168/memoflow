import type {
  AttentionCountResponse,
  NotificationClientDTO,
  NotificationQuery,
  NotificationOwnerAttention,
} from '@memoflow/notification-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import { fail, ok } from '@memoflow/transport-contracts/result';
import type {
  INotificationInteractionRepository,
  INotificationRepository,
} from '../../domain/repositories';
import type { NotificationOwnerCommandRegistry } from '../notification-owner-command.registry';
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
  nextAttentionAt: number | null;
}

const IMPORTANCE_ORDER: Record<string, number> = {
  Vital: 5,
  Important: 4,
  Moderate: 3,
  Minor: 2,
  Trivial: 1,
};

export class NotificationQueryApplicationService {
  constructor(
    private readonly notificationRepository: INotificationRepository,
    private readonly interactionRepository: INotificationInteractionRepository,
    private readonly ownerReader?: Pick<NotificationOwnerCommandRegistry, 'readAttention'>,
    private readonly clock: () => number = Date.now,
  ) {}

  async listNotifications(query: NotificationListQuery): Promise<Result<NotificationListPage>> {
    if (!query.identityId)
      return fail({
        code: 'BAD_REQUEST',
        message: 'identityId is required for listing notifications / 列出通知需要 identityId',
      });
    const page = query.page ?? 1;
    const pageSize = query.limit ?? 20;
    const offset = Math.max((page - 1) * pageSize, 0);
    const archiveState = query.archiveState ?? 'active';
    const notifications = await this.projectIdentity(query.identityId);
    const filtered = notifications
      .filter((notification) => notification.deletedAt === null)
      .filter(
        (notification) =>
          archiveState === 'all' ||
          (archiveState === 'archived'
            ? notification.archivedAt !== null
            : notification.archivedAt === null),
      )
      .filter(
        (notification) =>
          query.needsAttention === undefined ||
          notification.needsAttention === query.needsAttention,
      )
      .filter((notification) => query.isRead === undefined || notification.isRead === query.isRead)
      .filter(
        (notification) =>
          !query.relatedEntityType || notification.relatedEntityType === query.relatedEntityType,
      )
      .filter(
        (notification) =>
          !query.relatedEntityId || notification.relatedEntityId === query.relatedEntityId,
      )
      .filter((notification) => !query.type || notification.type === query.type)
      .filter((notification) => !query.category || notification.category === query.category)
      .filter(
        (notification) => !query.workflowKey || notification.workflowKey === query.workflowKey,
      )
      .filter((notification) => !query.topic || notification.topic === query.topic)
      .filter((notification) => this.matchesKeyword(notification, query.keyword))
      .filter(
        (notification) =>
          query.startDate === undefined || notification.createdAt >= query.startDate,
      )
      .filter(
        (notification) => query.endDate === undefined || notification.createdAt <= query.endDate,
      )
      .sort((left, right) => this.compareNotifications(left, right, query.sortBy, query.sortOrder));
    return ok({
      notifications: filtered.slice(offset, offset + pageSize),
      total: filtered.length,
      page,
      pageSize,
      hasMore: offset + pageSize < filtered.length,
      nextAttentionAt: this.nextBoundary(notifications),
    });
  }

  async getAttentionCount(identityId: string): Promise<Result<AttentionCountResponse>> {
    if (!identityId) return fail({ code: 'BAD_REQUEST', message: 'identityId is required' });
    const notifications = await this.projectIdentity(identityId);
    return ok({
      count: notifications.filter((notification) => notification.needsAttention).length,
      nextAttentionAt: this.nextBoundary(notifications),
    });
  }

  async getNotification(id: string, identityId: string): Promise<Result<NotificationClientDTO>> {
    const notification = await this.notificationRepository.findByIdForIdentity(identityId, id);
    if (!notification) return fail({ code: 'NOT_FOUND', message: 'notification not found' });
    const dto = toNotificationClientDTO(notification.toServerDTO());
    const projected = await this.projectIdentity(identityId, dto);
    return ok(projected.find((candidate) => candidate.id === dto.id)!);
  }

  /**
   * Project the entire identity before filters/pagination. Snooze creates a new
   * presentation for the SAME occurrence: its old rows remain history, not extra
   * pending actions. Deleted/archived latest rows must not resurrect older ones.
   */
  private async projectIdentity(
    identityId: string,
    detail?: NotificationClientDTO,
  ): Promise<NotificationClientDTO[]> {
    const records = await this.notificationRepository.findByIdentityId(identityId, {
      includeDeleted: true,
      includeRead: true,
      archiveState: 'all',
    });
    const notifications = records
      .map((record) => toNotificationClientDTO(record.toServerDTO()))
      .filter((notification) => notification.identityId === identityId);
    if (detail && !notifications.some((notification) => notification.id === detail.id))
      notifications.push(detail);
    const now = this.clock();
    const [owners, interactions] = await Promise.all([
      this.ownerReader?.readAttention(identityId, notifications, now) ??
        Promise.resolve(new Map<string, NotificationOwnerAttention>()),
      this.interactionRepository.listByNotifications(
        identityId,
        notifications.map((notification) => String(notification.id)),
      ),
    ]);
    const newest = new Map<string, NotificationClientDTO>();
    for (const notification of notifications) {
      const owner = owners.get(String(notification.id));
      if (!owner) continue;
      const key = JSON.stringify([notification.workflowKey, owner.groupKey]);
      const previous = newest.get(key);
      if (
        !previous ||
        notification.createdAt > previous.createdAt ||
        (notification.createdAt === previous.createdAt &&
          String(notification.id) > String(previous.id))
      ) {
        newest.set(key, notification);
      }
    }
    const accepted = new Map<string, Set<string>>();
    for (const interaction of interactions) {
      if (interaction.actionKind !== 'owner-command' || interaction.outcome !== 'accepted')
        continue;
      const keys = accepted.get(String(interaction.notificationId)) ?? new Set<string>();
      keys.add(interaction.actionKey);
      accepted.set(String(interaction.notificationId), keys);
    }
    return notifications.map((notification) => {
      const id = String(notification.id);
      const owner = owners.get(id);
      const visible =
        notification.deletedAt === null &&
        notification.archivedAt === null &&
        (notification.expiresAt == null || notification.expiresAt > now);
      const latest =
        !owner ||
        newest.get(JSON.stringify([notification.workflowKey, owner.groupKey]))?.id ===
          notification.id;
      const needsAttention =
        visible && (owner ? latest && owner.needsAction : !notification.isRead);
      const canAct = visible && latest && (owner ? owner.needsAction : !accepted.has(id));
      return {
        ...notification,
        needsAttention,
        nextAttentionAt: visible && latest ? (owner?.nextAttentionAt ?? null) : null,
        actions: notification.actions?.filter((action) => {
          if (action.kind !== 'owner-command') return true;
          if (!canAct) return false;
          // A consumed snooze belongs to this presentation. The Scheduler's
          // fresh presentation restores Clock; Complete remains usable meanwhile.
          return !(
            owner &&
            action.commandKey === 'routine.snooze' &&
            accepted.get(id)?.has(action.actionKey)
          );
        }),
      };
    });
  }

  private nextBoundary(notifications: readonly NotificationClientDTO[]): number | null {
    let next = Infinity;
    for (const notification of notifications) {
      if (notification.nextAttentionAt != null) next = Math.min(next, notification.nextAttentionAt);
      if (notification.needsAttention && notification.expiresAt != null)
        next = Math.min(next, notification.expiresAt);
    }
    return Number.isFinite(next) ? next : null;
  }

  private matchesKeyword(notification: NotificationClientDTO, keyword?: string): boolean {
    const normalized = keyword?.trim().toLowerCase();
    return (
      !normalized ||
      notification.title.toLowerCase().includes(normalized) ||
      notification.content.toLowerCase().includes(normalized)
    );
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
    if (leftValue === rightValue)
      return (
        direction *
        (left.createdAt - right.createdAt || String(left.id).localeCompare(String(right.id)))
      );
    return leftValue > rightValue ? direction : -direction;
  }

  private getSortValue(
    notification: NotificationClientDTO,
    sortBy: NotificationQuery['sortBy'],
  ): number {
    switch (sortBy) {
      case 'updatedAt':
      case 'urgency':
        return notification.updatedAt;
      case 'importance':
        return IMPORTANCE_ORDER[notification.importance] ?? 0;
      default:
        return notification.createdAt;
    }
  }
}
