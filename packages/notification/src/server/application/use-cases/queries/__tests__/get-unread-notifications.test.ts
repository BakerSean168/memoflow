import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { anIdentityId } from '@memoflow/test-utils/fixtures';
import type { INotificationRepository } from '../../../../domain/repositories/i-notification-preference-repository';
import { GetUnreadNotificationsUseCase } from '../get-unread-notifications.use-case';
import { Notification } from '../../../../domain/aggregates/notification';
import { NotificationType, NotificationCategory } from '@memoflow/notification-contracts';

describe('GetUnreadNotificationsUseCase', () => {
  let notificationRepo: ReturnType<typeof createMockRepo<INotificationRepository>>;
  let useCase: GetUnreadNotificationsUseCase;

  function aNotification(identityId: string) {
    return Notification.create({
      identityId,
      workflowKey: 'system.general',
      topic: 'system.general',
      idempotencyKey: 'unread-list:' + identityId,
      title: 'Unread notification',
      content: 'Content',
      type: NotificationType.Info,
      category: NotificationCategory.System,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();

    notificationRepo = createMockRepo<INotificationRepository>({
      findUnread: vi.fn().mockResolvedValue([]),
      countUnread: vi.fn().mockResolvedValue(0),
    });

    useCase = new GetUnreadNotificationsUseCase(notificationRepo);
  });

  describe('execute()', () => {
    it('should return empty array when no unread notifications', async () => {
      const result = await useCase.execute(anIdentityId());

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');
      expect(result.data).toEqual([]);
    });

    it('should return client DTOs for unread notifications', async () => {
      const identityId = anIdentityId();
      const notifications = [aNotification(identityId)];
      vi.mocked(notificationRepo.findUnread).mockResolvedValue(notifications);

      const result = await useCase.execute(identityId);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('Unread notification');
      expect(result.data[0].isRead).toBe(false);
    });

    it('should pass options to repository', async () => {
      const identityId = anIdentityId();

      await useCase.execute(identityId, { limit: 5 });

      expect(notificationRepo.findUnread).toHaveBeenCalledWith(identityId, { limit: 5 });
    });

    it('should call findUnread without options when none provided', async () => {
      const identityId = anIdentityId();

      await useCase.execute(identityId);

      expect(notificationRepo.findUnread).toHaveBeenCalledWith(identityId, undefined);
    });
  });

  describe('getCount()', () => {
    it('should return 0 when no unread notifications', async () => {
      const result = await useCase.getCount(anIdentityId());

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');
      expect(result.data.count).toBe(0);
    });

    it('should return the count from repository', async () => {
      vi.mocked(notificationRepo.countUnread).mockResolvedValue(42);

      const result = await useCase.getCount(anIdentityId());

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');
      expect(result.data.count).toBe(42);
    });

    it('should call countUnread with the identity id', async () => {
      const identityId = anIdentityId();

      await useCase.getCount(identityId);

      expect(notificationRepo.countUnread).toHaveBeenCalledWith(identityId);
    });
  });
});
