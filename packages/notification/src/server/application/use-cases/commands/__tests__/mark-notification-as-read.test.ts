import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { anIdentityId } from '@memoflow/test-utils/fixtures';
import type { INotificationRepository } from '../../../../domain/repositories/i-notification-repository';
import { Notification } from '../../../../domain/aggregates/notification';
import { NotificationCategory, NotificationType } from '@memoflow/notification-contracts';
import { MarkNotificationAsReadUseCase } from '../mark-notification-as-read.use-case';

function anUnreadFact(identityId = anIdentityId()) {
  return Notification.create({
    identityId,
    workflowKey: 'system.general',
    topic: 'system.general',
    idempotencyKey: `read-test:${Math.random()}`,
    title: 'Test',
    content: 'Content',
    type: NotificationType.Info,
    category: NotificationCategory.System,
  });
}

describe('MarkNotificationAsReadUseCase — Fact read state', () => {
  let notificationRepo: ReturnType<typeof createMockRepo<INotificationRepository>>;
  let useCase: MarkNotificationAsReadUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    notificationRepo = createMockRepo<INotificationRepository>({
      save: vi.fn().mockResolvedValue(undefined),
      saveMany: vi.fn().mockResolvedValue(undefined),
      findByIdForIdentity: vi.fn(),
      findUnread: vi.fn().mockResolvedValue([]),
    });
    useCase = new MarkNotificationAsReadUseCase(notificationRepo);
  });

  it('marks an unread Fact read without a delivery-status transition', async () => {
    const fact = anUnreadFact();
    vi.mocked(notificationRepo.findByIdForIdentity).mockResolvedValue(fact);
    const result = await useCase.execute(String(fact.id), String(fact.identityId));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.isRead).toBe(true);
    expect(result.data.readAt).toEqual(expect.any(Number));
    expect(result.data).not.toHaveProperty('status');
    expect(notificationRepo.save).toHaveBeenCalledWith(fact);
  });

  it('preserves the identity ownership fence', async () => {
    const fact = anUnreadFact('identity-1' as never);
    vi.mocked(notificationRepo.findByIdForIdentity).mockResolvedValue(fact);
    await useCase.execute('notification-1', 'identity-1');
    expect(notificationRepo.findByIdForIdentity).toHaveBeenCalledWith(
      'identity-1',
      'notification-1',
    );
  });

  it('returns NOT_FOUND when the owned Fact does not exist', async () => {
    vi.mocked(notificationRepo.findByIdForIdentity).mockResolvedValue(null);
    const result = await useCase.execute('missing', 'identity-1');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('is idempotent for an already-read Fact', async () => {
    const fact = anUnreadFact();
    fact.markAsRead();
    const firstReadAt = fact.readAt;
    vi.mocked(notificationRepo.findByIdForIdentity).mockResolvedValue(fact);
    const result = await useCase.execute(String(fact.id), String(fact.identityId));
    expect(result.ok).toBe(true);
    expect(fact.readAt).toBe(firstReadAt);
    expect(notificationRepo.save).toHaveBeenCalledTimes(1);
  });

  it('marks a batch of owned Facts read', async () => {
    const facts = [anUnreadFact(), anUnreadFact(), anUnreadFact()];
    vi.mocked(notificationRepo.findByIdForIdentity)
      .mockResolvedValueOnce(facts[0])
      .mockResolvedValueOnce(facts[1])
      .mockResolvedValueOnce(facts[2]);
    const result = await useCase.executeMany(
      facts.map((fact) => String(fact.id)),
      'identity-batch',
    );
    expect(result).toEqual({ ok: true, data: 3 });
    expect(facts.every((fact) => fact.isRead)).toBe(true);
    expect(notificationRepo.saveMany).toHaveBeenCalledWith(facts);
  });

  it('marks all unread Facts for one identity and leaves delivery concerns untouched', async () => {
    const facts = [anUnreadFact(), anUnreadFact()];
    vi.mocked(notificationRepo.findUnread).mockResolvedValue(facts);
    const result = await useCase.executeAll('identity-all');
    expect(result).toEqual({ ok: true, data: 2 });
    expect(notificationRepo.findUnread).toHaveBeenCalledWith('identity-all');
    expect(facts.every((fact) => fact.isRead)).toBe(true);
  });
});
