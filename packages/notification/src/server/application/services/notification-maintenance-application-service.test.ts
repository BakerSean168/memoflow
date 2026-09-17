import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { INotificationRepository } from '../../domain/repositories';
import { NotificationMaintenanceApplicationService } from './notification-maintenance-application-service';
import { NotificationCategory } from '@memoflow/contracts/notification';

const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440001';

function createNotificationRecord(overrides: Partial<{
  id: string;
  identityId: string;
  category: NotificationCategory;
  expiresAt: number | null;
}> = {}) {
  const dto = {
    id: 'INotificationId_550e8400-e29b-41d4-a716-446655440000',
    identityId: IDENTITY_ID,
    workflowKey: 'system.general',
    topic: 'system.general',
    idempotencyKey: 'maintenance-fixture',
    title: 'Notification',
    content: 'Content',
    type: 'Info',
    category: NotificationCategory.System,
    importance: 'Moderate',
    urgency: 'Medium',
    isRead: false,
    readAt: null,
    actions: null,
    metadata: null,
    expiresAt: null,
    version: 1,
    createdAt: 100,
    updatedAt: 100,
    deletedAt: null,
    notificationChannels: null,
    ...overrides,
  };

  return {
    id: dto.id,
    markAsUnread: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    softDelete: vi.fn(),
    toServerDTO: vi.fn().mockReturnValue(dto),
  };
}

describe('NotificationMaintenanceApplicationService', () => {
  let notificationRepository: ReturnType<typeof createMockRepo<INotificationRepository>>;
  let service: NotificationMaintenanceApplicationService;

  beforeEach(() => {
    notificationRepository = createMockRepo<INotificationRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
      findByIdentityId: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      saveMany: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue(undefined),
    });
    service = new NotificationMaintenanceApplicationService(notificationRepository);
  });

  it.each([
    ['markAsUnread', 'markAsUnread'],
    ['archive', 'archive'],
    ['restore', 'restore'],
  ] as const)('%s mutates and saves the identity-owned notification', async (method, mutation) => {
    const notification = createNotificationRecord();
    (notificationRepository.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(notification);

    const result = await service[method](notification.id, IDENTITY_ID);

    expect(notification[mutation]).toHaveBeenCalledTimes(1);
    expect(notificationRepository.save).toHaveBeenCalledWith(notification);
    expect(result.ok).toBe(true);
  });

  it.each(['markAsUnread', 'archive', 'restore'] as const)('%s fails closed when the notification is not identity-owned', async (method) => {
    const result = await service[method]('missing', IDENTITY_ID);

    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'notification not found' },
    });
    expect(notificationRepository.save).not.toHaveBeenCalled();
  });

  it('soft deletes a single notification through the application service', async () => {
    const notification = createNotificationRecord();
    (notificationRepository.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(notification);

    const result = await service.deleteNotification(notification.id, IDENTITY_ID);

    expect(notification.softDelete).toHaveBeenCalledTimes(1);
    expect(notificationRepository.save).toHaveBeenCalledWith(notification);
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it('fails closed when deleting a missing notification', async () => {
    const result = await service.deleteNotification('missing', IDENTITY_ID);

    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'notification not found' },
    });
    expect(notificationRepository.save).not.toHaveBeenCalled();
  });

  it('soft deletes found notifications in a batch and returns deletedCount', async () => {
    const first = createNotificationRecord({ id: 'INotificationId_550e8400-e29b-41d4-a716-446655440001' });
    const second = createNotificationRecord({ id: 'INotificationId_550e8400-e29b-41d4-a716-446655440002' });
    (notificationRepository.findByIdForIdentity as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    const result = await service.batchDelete({
      notificationIds: [first.id, second.id],
      identityId: IDENTITY_ID,
    });

    expect(first.softDelete).toHaveBeenCalledTimes(1);
    expect(second.softDelete).toHaveBeenCalledTimes(1);
    expect(notificationRepository.saveMany).toHaveBeenCalledWith([first, second]);
    expect(result).toEqual({
      ok: true,
      data: { deletedCount: 2 },
    });
  });

  it('batch deletion ignores missing ids while preserving the found count', async () => {
    const found = createNotificationRecord();
    (notificationRepository.findByIdForIdentity as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(found)
      .mockResolvedValueOnce(null);

    const result = await service.batchDelete({
      notificationIds: [found.id, 'missing'],
      identityId: IDENTITY_ID,
    });

    expect(found.softDelete).toHaveBeenCalledTimes(1);
    expect(notificationRepository.saveMany).toHaveBeenCalledWith([found]);
    expect(result).toEqual({ ok: true, data: { deletedCount: 1 } });
  });

  it('cleans up only matching expired notifications for the identity and category', async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    (notificationRepository.findByIdentityId as ReturnType<typeof vi.fn>).mockResolvedValue([
      createNotificationRecord({
        id: 'INotificationId_550e8400-e29b-41d4-a716-446655440010',
        identityId: IDENTITY_ID,
        category: NotificationCategory.System,
        expiresAt: now - 40 * 24 * 60 * 60 * 1000,
      }),
      createNotificationRecord({
        id: 'INotificationId_550e8400-e29b-41d4-a716-446655440011',
        identityId: IDENTITY_ID,
        category: NotificationCategory.Task,
        expiresAt: now - 40 * 24 * 60 * 60 * 1000,
      }),
      createNotificationRecord({
        id: 'INotificationId_550e8400-e29b-41d4-a716-446655440012',
        identityId: IDENTITY_ID,
        category: NotificationCategory.System,
        expiresAt: now - 5 * 24 * 60 * 60 * 1000,
      }),
    ]);

    const result = await service.cleanupOldNotifications({
      identityId: IDENTITY_ID,
      beforeDays: 30,
      category: NotificationCategory.System,
    });

    expect(notificationRepository.findByIdentityId).toHaveBeenCalledWith(IDENTITY_ID, {
      includeDeleted: false,
      includeRead: true,
    });
    expect(notificationRepository.deleteMany).toHaveBeenCalledWith(
      IDENTITY_ID,
      [
        'INotificationId_550e8400-e29b-41d4-a716-446655440010',
      ],
    );
    expect(result).toEqual({
      ok: true,
      data: { deletedCount: 1 },
    });
    vi.useRealTimers();
  });

  it('cleans up expired notifications across categories when no category filter is supplied', async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    (notificationRepository.findByIdentityId as ReturnType<typeof vi.fn>).mockResolvedValue([
      createNotificationRecord({
        id: 'INotificationId_550e8400-e29b-41d4-a716-446655440020',
        category: NotificationCategory.Task,
        expiresAt: now - 40 * 24 * 60 * 60 * 1000,
      }),
      createNotificationRecord({
        id: 'INotificationId_550e8400-e29b-41d4-a716-446655440021',
        category: NotificationCategory.System,
        expiresAt: null,
      }),
    ]);

    const result = await service.cleanupOldNotifications({
      identityId: IDENTITY_ID,
      beforeDays: 30,
    });

    expect(notificationRepository.deleteMany).toHaveBeenCalledWith(
      IDENTITY_ID,
      ['INotificationId_550e8400-e29b-41d4-a716-446655440020'],
    );
    expect(result).toEqual({ ok: true, data: { deletedCount: 1 } });
    vi.useRealTimers();
  });

  it('does not call deleteMany when no notification is expired', async () => {
    (notificationRepository.findByIdentityId as ReturnType<typeof vi.fn>).mockResolvedValue([
      createNotificationRecord({ expiresAt: null }),
    ]);

    const result = await service.cleanupOldNotifications({
      identityId: IDENTITY_ID,
      beforeDays: 30,
    });

    expect(notificationRepository.deleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, data: { deletedCount: 0 } });
  });
});