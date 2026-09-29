import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type {
  INotificationInteractionRepository,
  INotificationRepository,
} from '../../domain/repositories';
import { NotificationQueryApplicationService } from './notification-query-application-service';
import {
  NotificationCategory,
  NotificationType,
  type NotificationClientDTO,
} from '@memoflow/contracts/notification';

const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440001';

type NotificationDtoOverrides = Partial<{
  id: string;
  identityId: string;
  title: string;
  content: string;
  type: NotificationType;
  category: NotificationCategory;
  workflowKey: string;
  topic: string;
  isRead: boolean;
  importance: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  archivedAt: number | null;
  actions: NotificationClientDTO['actions'];
}>;

function createNotificationRecord(overrides: NotificationDtoOverrides = {}) {
  const dto = {
    id: 'INotificationId_550e8400-e29b-41d4-a716-446655440000',
    identityId: IDENTITY_ID,
    workflowKey: 'system.general',
    topic: 'system.general',
    idempotencyKey: 'query-test-1',
    title: 'System update',
    content: 'A system event happened',
    type: NotificationType.Info,
    category: NotificationCategory.System,
    importance: 'Moderate',
    urgency: 'Medium',
    relatedEntityType: null,
    relatedEntityId: null,
    navigationIntent: null,
    correlationId: null,
    causationId: null,
    isRead: false,
    readAt: null,
    actions: null,
    metadata: null,
    expiresAt: null,
    version: 1,
    createdAt: 100,
    updatedAt: 110,
    deletedAt: null,
    archivedAt: null,
    notificationChannels: null,
    ...overrides,
  };

  return {
    toServerDTO: vi.fn().mockReturnValue(dto),
  };
}

describe('NotificationQueryApplicationService', () => {
  let notificationRepository: ReturnType<typeof createMockRepo<INotificationRepository>>;
  let interactionRepository: ReturnType<typeof createMockRepo<INotificationInteractionRepository>>;
  let service: NotificationQueryApplicationService;

  beforeEach(() => {
    notificationRepository = createMockRepo<INotificationRepository>({
      findByIdentityId: vi.fn().mockResolvedValue([]),
      findByRelatedEntity: vi.fn().mockResolvedValue([]),
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
    });
    interactionRepository = createMockRepo<INotificationInteractionRepository>({
      listByNotification: vi.fn().mockResolvedValue([]),
      listByNotifications: vi.fn().mockResolvedValue([]),
    });
    service = new NotificationQueryApplicationService(
      notificationRepository,
      interactionRepository,
    );
  });

  it('filters, sorts, and paginates notifications in the application layer', async () => {
    (notificationRepository.findByIdentityId as ReturnType<typeof vi.fn>).mockResolvedValue([
      createNotificationRecord({
        id: 'INotificationId_550e8400-e29b-41d4-a716-446655440001',
        title: 'Alpha task',
        content: 'Focus session',
        category: NotificationCategory.Task,
        type: NotificationType.Info,
        isRead: false,
        createdAt: 100,
        updatedAt: 200,
      }),
      createNotificationRecord({
        id: 'INotificationId_550e8400-e29b-41d4-a716-446655440002',
        title: 'Beta task',
        content: 'Focus longer',
        category: NotificationCategory.Task,
        type: NotificationType.Info,
        isRead: false,
        createdAt: 150,
        updatedAt: 250,
      }),
      createNotificationRecord({
        id: 'INotificationId_550e8400-e29b-41d4-a716-446655440003',
        title: 'Gamma read',
        content: 'Already read',
        category: NotificationCategory.Task,
        type: NotificationType.Info,
        isRead: true,
        createdAt: 175,
        updatedAt: 300,
      }),
    ]);

    const result = await service.listNotifications({
      identityId: IDENTITY_ID,
      category: NotificationCategory.Task,
      isRead: false,
      keyword: 'task',
      page: 1,
      limit: 1,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });

    expect(notificationRepository.findByIdentityId).toHaveBeenCalledWith(IDENTITY_ID, {
      includeDeleted: false,
      includeRead: false,
      archiveState: 'active',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        notifications: [
          expect.objectContaining({
            id: 'INotificationId_550e8400-e29b-41d4-a716-446655440002',
            title: 'Beta task',
          }),
        ],
        total: 2,
        page: 1,
        pageSize: 1,
        hasMore: true,
      });
    }
  });

  it('uses related-entity lookup when relatedEntity filters are provided', async () => {
    (notificationRepository.findByRelatedEntity as ReturnType<typeof vi.fn>).mockResolvedValue([
      createNotificationRecord({
        id: 'INotificationId_550e8400-e29b-41d4-a716-446655440010',
      }),
    ]);

    const result = await service.listNotifications({
      identityId: IDENTITY_ID,
      relatedEntityType: 'Task',
      relatedEntityId: 'TaskId_550e8400-e29b-41d4-a716-446655440001',
    });

    expect(notificationRepository.findByRelatedEntity).toHaveBeenCalledWith(
      IDENTITY_ID,
      'Task',
      'TaskId_550e8400-e29b-41d4-a716-446655440001',
      { archiveState: 'active' },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.total).toBe(1);
    }
  });

  it('suppresses stale owner commands after an accepted business interaction without changing read state', async () => {
    const notificationId = 'INotificationId_550e8400-e29b-41d4-a716-446655440020';
    (notificationRepository.findByIdentityId as ReturnType<typeof vi.fn>).mockResolvedValue([
      createNotificationRecord({
        id: notificationId,
        isRead: false,
        actions: [
          {
            kind: 'owner-command',
            actionKey: 'complete',
            labelKey: 'routine.action.complete',
            owner: { type: 'routine-occurrence', id: 'occ-1' },
            commandKey: 'routine.complete',
            input: { routineId: 'routine-1', occurrenceKey: 'occ-1' },
          },
          {
            kind: 'owner-command',
            actionKey: 'snooze-10m',
            labelKey: 'routine.action.snooze10m',
            owner: { type: 'routine-occurrence', id: 'occ-1' },
            commandKey: 'routine.snooze',
            input: {
              routineId: 'routine-1',
              occurrenceKey: 'occ-1',
              durationMs: 600_000,
            },
          },
          {
            kind: 'archive',
            actionKey: 'archive',
            labelKey: 'notification.action.archive',
          },
        ],
      }),
    ]);
    (interactionRepository.listByNotifications as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'interaction-1',
        idempotencyKey: 'notification:n:action:complete',
        identityId: IDENTITY_ID,
        notificationId,
        actionKey: 'complete',
        actionKind: 'owner-command',
        occurredAt: 500,
        commandReceiptId: 'routine-interaction-1',
        outcome: 'accepted',
        correlationId: null,
        causationId: null,
      },
    ]);

    const result = await service.listNotifications({
      identityId: IDENTITY_ID,
      page: 1,
      limit: 20,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.notifications[0]).toMatchObject({
      id: notificationId,
      isRead: false,
      actions: [
        {
          kind: 'archive',
          actionKey: 'archive',
        },
      ],
    });
    expect(interactionRepository.listByNotifications).toHaveBeenCalledWith(IDENTITY_ID, [
      notificationId,
    ]);
  });

  it('keeps owner commands available when the interaction was rejected', async () => {
    const notificationId = 'INotificationId_550e8400-e29b-41d4-a716-446655440021';
    (notificationRepository.findByIdentityId as ReturnType<typeof vi.fn>).mockResolvedValue([
      createNotificationRecord({
        id: notificationId,
        actions: [
          {
            kind: 'owner-command',
            actionKey: 'complete',
            labelKey: 'routine.action.complete',
            owner: { type: 'routine-occurrence', id: 'occ-1' },
            commandKey: 'routine.complete',
            input: { routineId: 'routine-1', occurrenceKey: 'occ-1' },
          },
        ],
      }),
    ]);
    (interactionRepository.listByNotifications as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'interaction-rejected',
        idempotencyKey: 'notification:n:action:complete',
        identityId: IDENTITY_ID,
        notificationId,
        actionKey: 'complete',
        actionKind: 'owner-command',
        occurredAt: 500,
        commandReceiptId: null,
        outcome: 'rejected',
        correlationId: null,
        causationId: null,
      },
    ]);

    const result = await service.listNotifications({
      identityId: IDENTITY_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.notifications[0]?.actions).toEqual([
      expect.objectContaining({ actionKey: 'complete' }),
    ]);
  });

  it('returns NOT_FOUND for missing notification detail', async () => {
    const result = await service.getNotification('missing', IDENTITY_ID);

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'notification not found',
      },
    });
  });
});
