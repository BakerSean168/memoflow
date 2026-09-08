import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { anIdentityId } from '@memoflow/test-utils/fixtures';
import {
  NotificationCategory,
  NotificationChannelType,
  NotificationDeliveryPlanOutcome,
  NotificationDeliveryReason,
  NotificationType,
} from '@memoflow/contracts/notification';
import type { INotificationRepository } from '../../../../domain/repositories/i-notification-repository';
import type { INotificationPreferenceRepository } from '../../../../domain/repositories/i-notification-preference-repository';
import { Notification } from '../../../../domain/aggregates/notification';
import { NotificationPreference } from '../../../../domain/aggregates/notification-preference';
import { DoNotDisturbConfig } from '../../../../domain/value-objects/do-not-disturb-config';
import { RateLimit } from '../../../../domain/value-objects/rate-limit';
import { CreateNotificationUseCase } from '../create-notification.use-case';

describe('NOTIF-2401 CreateNotificationUseCase Fact / DeliveryPlan', () => {
  let notificationRepo: ReturnType<typeof createMockRepo<INotificationRepository>>;
  let preferenceRepo: ReturnType<typeof createMockRepo<INotificationPreferenceRepository>>;
  let useCase: CreateNotificationUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    notificationRepo = createMockRepo<INotificationRepository>({
      save: vi.fn().mockResolvedValue(undefined),
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      getDeliveryUsage: vi.fn().mockResolvedValue({ hourCount: 0, dayCount: 0 }),
    });
    preferenceRepo = createMockRepo<INotificationPreferenceRepository>({
      findByIdentityId: vi.fn().mockResolvedValue(null),
    });
    useCase = new CreateNotificationUseCase(notificationRepo, preferenceRepo, async () => false);
  });

  it('creates an unread Fact without a root delivery status', async () => {
    const result = await useCase.execute({
      identityId: anIdentityId(),
      workflowKey: 'system.news',
      topic: 'system.news',
      idempotencyKey: 'fact-1',
      title: 'Fact',
      content: 'Visible fact',
      type: NotificationType.Info,
      category: NotificationCategory.System,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toMatchObject({
      workflowKey: 'system.news',
      topic: 'system.news',
      idempotencyKey: 'fact-1',
      isRead: false,
    });
    expect(result.data).not.toHaveProperty('status');
  });

  it('protects Wave 1 mixed-channel behavior: Email disabled never enqueues when InApp is allowed', async () => {
    const identityId = anIdentityId();
    const preference = NotificationPreference.create({ identityId });
    preference.setGlobalChannel(NotificationChannelType.InApp, true);
    preference.setGlobalChannel(NotificationChannelType.Email, false);
    vi.mocked(preferenceRepo.findByIdentityId).mockResolvedValue(preference);

    const result = await useCase.execute({
      identityId,
      workflowKey: 'system.general',
      title: 'Mixed',
      content: 'Independent decisions',
      type: NotificationType.Info,
      category: NotificationCategory.System,
      channels: [NotificationChannelType.InApp, NotificationChannelType.Email],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.notificationChannels?.map((channel) => channel.channelType)).toEqual([
      NotificationChannelType.InApp,
    ]);

    const [, outbox, decisions] = vi.mocked(notificationRepo.save).mock.calls[0];
    expect(outbox?.map((entry) => entry.channel)).toEqual([NotificationChannelType.InApp]);
    expect(decisions).toContainEqual({
      channel: NotificationChannelType.Email,
      outcome: NotificationDeliveryPlanOutcome.Disabled,
      reason: NotificationDeliveryReason.UserGlobalDisabled,
      preferenceSource: 'user_global',
    });
  });

  it('Fixture I: DND keeps the Inbox Fact unread when Desktop delivery is suppressed', async () => {
    const identityId = anIdentityId();
    const now = new Date('2026-08-25T23:30:00');
    const preference = NotificationPreference.create({ identityId });
    preference.setDoNotDisturb(DoNotDisturbConfig.create({
      enabled: true,
      startTime: '22:00',
      endTime: '08:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    }));
    vi.mocked(preferenceRepo.findByIdentityId).mockResolvedValue(preference);
    const duringDnd = new CreateNotificationUseCase(
      notificationRepo,
      preferenceRepo,
      async () => false,
      () => now,
    );

    const result = await duringDnd.execute({
      identityId,
      workflowKey: 'system.general',
      title: 'DND',
      content: 'Fact remains visible',
      type: NotificationType.Info,
      category: NotificationCategory.System,
      channels: [NotificationChannelType.Desktop],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.isRead).toBe(false);
    expect(result.data.notificationChannels).toBeNull();

    const [, outbox, decisions] = vi.mocked(notificationRepo.save).mock.calls[0];
    expect(outbox).toEqual([]);
    expect(decisions?.[0]).toMatchObject({
      channel: NotificationChannelType.Desktop,
      outcome: NotificationDeliveryPlanOutcome.Suppressed,
      reason: NotificationDeliveryReason.DndActive,
    });
  });

  it('Fixture I: DND preserves defer semantics for an allowed InApp delivery', async () => {
    const identityId = anIdentityId();
    const now = new Date('2026-08-25T23:30:00');
    const dnd = DoNotDisturbConfig.create({
      enabled: true,
      startTime: '22:00',
      endTime: '08:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
    const preference = NotificationPreference.create({ identityId });
    preference.setDoNotDisturb(dnd);
    vi.mocked(preferenceRepo.findByIdentityId).mockResolvedValue(preference);
    const duringDnd = new CreateNotificationUseCase(
      notificationRepo,
      preferenceRepo,
      async () => false,
      () => now,
    );

    await duringDnd.execute({
      identityId,
      workflowKey: 'system.general',
      title: 'Later',
      content: 'Deferred',
      type: NotificationType.Info,
      category: NotificationCategory.System,
      channels: [NotificationChannelType.InApp],
    });
    const [, outbox, decisions] = vi.mocked(notificationRepo.save).mock.calls[0];
    expect(outbox?.[0].deferUntil?.toISOString()).toBe(dnd.nextInactiveAt(now)?.toISOString());
    expect(decisions?.[0]).toMatchObject({
      outcome: NotificationDeliveryPlanOutcome.Deferred,
      reason: NotificationDeliveryReason.DndActive,
    });
  });

  it('preserves rate-limit suppression without mutating Fact read state', async () => {
    const identityId = anIdentityId();
    const preference = NotificationPreference.create({ identityId });
    preference.setRateLimit(RateLimit.create({ enabled: true, maxPerHour: 1, maxPerDay: 10 }));
    vi.mocked(preferenceRepo.findByIdentityId).mockResolvedValue(preference);
    vi.mocked(notificationRepo.getDeliveryUsage).mockResolvedValue({ hourCount: 1, dayCount: 3 });

    const result = await useCase.execute({
      identityId,
      workflowKey: 'system.general',
      title: 'Burst',
      content: 'Rate limited',
      type: NotificationType.Info,
      category: NotificationCategory.System,
      channels: [NotificationChannelType.InApp],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.isRead).toBe(false);
    const [, outbox, decisions] = vi.mocked(notificationRepo.save).mock.calls[0];
    expect(outbox).toEqual([]);
    expect(decisions?.[0]).toMatchObject({
      outcome: NotificationDeliveryPlanOutcome.RateLimited,
      reason: NotificationDeliveryReason.RateLimitHour,
    });
  });

  it('uses a caller idempotency key as a Fact-level fence', async () => {
    const identityId = anIdentityId();
    const existing = Notification.create({
      identityId,
      workflowKey: 'system.general',
      topic: 'system.general',
      idempotencyKey: 'same-event',
      title: 'Original',
      content: 'Original',
      type: NotificationType.Info,
      category: NotificationCategory.System,
    });
    vi.mocked(notificationRepo.findByIdempotencyKey).mockResolvedValue(existing);

    const result = await useCase.execute({
      identityId,
      workflowKey: 'system.general',
      idempotencyKey: 'same-event',
      title: 'Duplicate',
      content: 'Duplicate',
      type: NotificationType.Info,
      category: NotificationCategory.System,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.title).toBe('Original');
    expect(notificationRepo.save).not.toHaveBeenCalled();
  });

  it('resolves a concurrent same-key Fact insert through the persistence idempotency fence', async () => {
    const identityId = anIdentityId();
    const existing = Notification.create({
      identityId,
      workflowKey: 'system.general',
      topic: 'system.general',
      idempotencyKey: 'race-key',
      title: 'Winner',
      content: 'Winner',
      type: NotificationType.Info,
      category: NotificationCategory.System,
    });
    vi.mocked(notificationRepo.findByIdempotencyKey)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    vi.mocked(notificationRepo.save).mockRejectedValueOnce(new Error('unique constraint'));

    const result = await useCase.execute({
      identityId,
      workflowKey: 'system.general',
      idempotencyKey: 'race-key',
      title: 'Loser',
      content: 'Loser',
      type: NotificationType.Info,
      category: NotificationCategory.System,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.title).toBe('Winner');
    expect(notificationRepo.findByIdempotencyKey).toHaveBeenCalledTimes(2);
  });

  it('deduplicates repeated requested channels before building the DeliveryPlan', async () => {
    const result = await useCase.execute({
      identityId: anIdentityId(),
      title: 'Duplicate channels',
      content: 'One channel plan per channel',
      type: NotificationType.Info,
      category: NotificationCategory.System,
      channels: [NotificationChannelType.InApp, NotificationChannelType.InApp],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.notificationChannels).toHaveLength(1);
    const [, outbox, decisions] = vi.mocked(notificationRepo.save).mock.calls[0];
    expect(outbox).toHaveLength(1);
    expect(decisions).toHaveLength(1);
  });

  it('keeps the fail-closed account-closure contract', async () => {
    const closed = new CreateNotificationUseCase(notificationRepo, preferenceRepo, async () => true);
    const result = await closed.execute({
      identityId: anIdentityId(),
      title: 'Blocked',
      content: 'Blocked',
      type: NotificationType.Info,
      category: NotificationCategory.System,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.code).toBe('FORBIDDEN');
  });
});
