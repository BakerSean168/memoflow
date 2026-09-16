import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { INotificationRepository } from '../../domain/repositories';
import { NotificationQueryApplicationService } from './notification-query-application-service';
import {
  NotificationCategory,
  NotificationType,
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
  let service: NotificationQueryApplicationService;

  beforeEach(() => {
    notificationRepository = createMockRepo<INotificationRepository>({
      findByIdentityId: vi.fn().mockResolvedValue([]),
      findByRelatedEntity: vi.fn().mockResolvedValue([]),
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
    });
    service = new NotificationQueryApplicationService(notificationRepository);
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