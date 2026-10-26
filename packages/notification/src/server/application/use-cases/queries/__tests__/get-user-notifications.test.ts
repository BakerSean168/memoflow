import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { anIdentityId } from '@memoflow/test-utils/fixtures';
import type { INotificationRepository } from '../../../../domain/repositories/i-notification-preference-repository';
import { GetUserNotificationsUseCase } from '../get-user-notifications.use-case';
import { Notification } from '../../../../domain/aggregates/notification';
import { NotificationType, NotificationCategory } from '@memoflow/notification-contracts';

describe('GetUserNotificationsUseCase', () => {
  let notificationRepo: ReturnType<typeof createMockRepo<INotificationRepository>>;
  let useCase: GetUserNotificationsUseCase;

  function aNotification(identityId: string) {
    return Notification.create({
      identityId,
      workflowKey: 'system.general',
      topic: 'system.general',
      idempotencyKey: 'user-list:' + identityId,
      title: 'Test',
      content: 'Content',
      type: NotificationType.Info,
      category: NotificationCategory.System,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();

    notificationRepo = createMockRepo<INotificationRepository>({
      findByIdentityId: vi.fn().mockResolvedValue([]),
    });

    useCase = new GetUserNotificationsUseCase(notificationRepo);
  });

  it('should return an empty array when no notifications exist', async () => {
    const result = await useCase.execute(anIdentityId());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.data).toEqual([]);
  });

  it('should return client DTOs for found notifications', async () => {
    const identityId = anIdentityId();
    const notifications = [aNotification(identityId), aNotification(identityId)];
    vi.mocked(notificationRepo.findByIdentityId).mockResolvedValue(notifications);

    const result = await useCase.execute(identityId);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.data).toHaveLength(2);
    expect(result.data[0].title).toBe('Test');
    expect(result.data[0].id).toBeTruthy();
  });

  it('should pass includeRead=true by default', async () => {
    const identityId = anIdentityId();

    await useCase.execute(identityId);

    expect(notificationRepo.findByIdentityId).toHaveBeenCalledWith(identityId, {
      includeRead: true,
      includeDeleted: false,
      limit: undefined,
      offset: undefined,
    });
  });

  it('should forward includeRead=false when specified', async () => {
    const identityId = anIdentityId();

    await useCase.execute(identityId, { includeRead: false });

    expect(notificationRepo.findByIdentityId).toHaveBeenCalledWith(identityId, {
      includeRead: false,
      includeDeleted: false,
      limit: undefined,
      offset: undefined,
    });
  });

  it('should forward limit and offset options', async () => {
    const identityId = anIdentityId();

    await useCase.execute(identityId, { limit: 10, offset: 5 });

    expect(notificationRepo.findByIdentityId).toHaveBeenCalledWith(identityId, {
      includeRead: true,
      includeDeleted: false,
      limit: 10,
      offset: 5,
    });
  });
});
