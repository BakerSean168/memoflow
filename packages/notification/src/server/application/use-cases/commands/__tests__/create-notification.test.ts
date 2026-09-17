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
import { QuietHours } from '../../../../domain/value-objects/quiet-hours';
import { SystemDeliveryGuard } from '../../../../domain/services/system-delivery-guard';
import { CreateNotificationUseCase } from '../create-notification.use-case';
import { asHm, createTimeContext, requireTimeZoneId } from '@memoflow/time';

const TEST_TIME_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const userTimeContextPort = {
  getUserTimeContext: vi.fn().mockResolvedValue(TEST_TIME_CONTEXT),
};

function nightlyQuietHours(): QuietHours {
  return QuietHours.create({
    enabled: true,
    timeZone: requireTimeZoneId('UTC'),
    weeklyWindows: [{
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      start: asHm('22:00'),
      end: asHm('08:00'),
    }],
  });
}

describe('CreateNotificationUseCase Fact / DeliveryPolicy', () => {
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
    useCase = new CreateNotificationUseCase(
      notificationRepo,
      preferenceRepo,
      async () => false,
      userTimeContextPort,
    );
  });

  it('creates an unread Fact without root delivery execution state', async () => {
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
    expect(result.data).not.toHaveProperty('notificationChannels');
  });

  it('requires explicit workflowKey instead of category inference', async () => {
    const result = await useCase.execute({
      identityId: anIdentityId(),
      title: 'No inferred workflow',
      content: 'Category is projection only',
      type: NotificationType.Warning,
      category: NotificationCategory.Task,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(notificationRepo.save).not.toHaveBeenCalled();
  });

  it('derives compatibility type/category from WorkflowDefinition', async () => {
    const result = await useCase.execute({
      identityId: anIdentityId(),
      workflowKey: 'task.reminder',
      title: 'Task reminder',
      content: 'Workflow semantics win',
      type: NotificationType.Error,
      category: NotificationCategory.Account,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toMatchObject({
      workflowKey: 'task.reminder',
      type: NotificationType.Reminder,
      category: NotificationCategory.Task,
    });
  });

  it('fails unknown workflow external channels closed while retaining Inbox capability', async () => {
    const result = await useCase.execute({
      identityId: anIdentityId(),
      workflowKey: 'extension.unknown',
      title: 'Extension fact',
      content: 'No external delivery without registration',
      channels: [NotificationChannelType.InApp, NotificationChannelType.Email],
    });
    expect(result.ok).toBe(true);
    const [, outbox, decisions] = vi.mocked(notificationRepo.save).mock.calls[0];
    expect(outbox?.map((entry) => entry.channel)).toEqual([NotificationChannelType.InApp]);
    expect(decisions).toContainEqual(expect.objectContaining({
      channel: NotificationChannelType.Email,
      outcome: NotificationDeliveryPlanOutcome.Unsupported,
    }));
  });

  it('keeps per-channel user preferences independent', async () => {
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
      channels: [NotificationChannelType.InApp, NotificationChannelType.Email],
    });
    expect(result.ok).toBe(true);
    const [, outbox, decisions] = vi.mocked(notificationRepo.save).mock.calls[0];
    expect(outbox?.map((entry) => entry.channel)).toEqual([NotificationChannelType.InApp]);
    expect(decisions).toContainEqual(expect.objectContaining({
      channel: NotificationChannelType.Email,
      outcome: NotificationDeliveryPlanOutcome.Disabled,
      reason: NotificationDeliveryReason.UserGlobalDisabled,
    }));
  });

  it('keeps Inbox Fact visible while QuietHours suppresses Desktop delivery', async () => {
    const identityId = anIdentityId();
    const preference = NotificationPreference.create({ identityId });
    preference.setQuietHours(nightlyQuietHours());
    vi.mocked(preferenceRepo.findByIdentityId).mockResolvedValue(preference);
    const duringQuietHours = new CreateNotificationUseCase(
      notificationRepo,
      preferenceRepo,
      async () => false,
      userTimeContextPort,
      () => new Date('2026-08-25T23:30:00.000Z'),
    );

    const result = await duringQuietHours.execute({
      identityId,
      workflowKey: 'system.general',
      title: 'Quiet',
      content: 'Fact remains visible',
      channels: [NotificationChannelType.Desktop],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.isRead).toBe(false);
    const [, outbox, decisions] = vi.mocked(notificationRepo.save).mock.calls[0];
    expect(outbox).toEqual([]);
    expect(decisions?.[0]).toMatchObject({
      outcome: NotificationDeliveryPlanOutcome.Suppressed,
      reason: NotificationDeliveryReason.DndActive,
    });
  });

  it('defers InApp until the explicit QuietHours wall-clock end', async () => {
    const identityId = anIdentityId();
    const preference = NotificationPreference.create({ identityId });
    preference.setQuietHours(nightlyQuietHours());
    vi.mocked(preferenceRepo.findByIdentityId).mockResolvedValue(preference);
    const duringQuietHours = new CreateNotificationUseCase(
      notificationRepo,
      preferenceRepo,
      async () => false,
      userTimeContextPort,
      () => new Date('2026-08-25T23:30:00.000Z'),
    );

    await duringQuietHours.execute({
      identityId,
      workflowKey: 'system.general',
      title: 'Later',
      content: 'Deferred',
      channels: [NotificationChannelType.InApp],
    });
    const [, outbox, decisions] = vi.mocked(notificationRepo.save).mock.calls[0];
    expect(outbox?.[0].deferUntil?.toISOString()).toBe('2026-08-26T08:00:00.000Z');
    expect(decisions?.[0]).toMatchObject({ outcome: NotificationDeliveryPlanOutcome.Deferred });
  });

  it('applies SystemDeliveryGuard independently from user preferences', async () => {
    vi.mocked(notificationRepo.getDeliveryUsage).mockResolvedValue({ hourCount: 1, dayCount: 3 });
    const guarded = new CreateNotificationUseCase(
      notificationRepo,
      preferenceRepo,
      async () => false,
      userTimeContextPort,
      () => new Date('2026-08-25T12:00:00.000Z'),
      undefined,
      new SystemDeliveryGuard(() => ({ maxPerHour: 1, maxPerDay: 10 })),
    );
    const result = await guarded.execute({
      identityId: anIdentityId(),
      workflowKey: 'system.general',
      title: 'Burst',
      content: 'Rate limited',
      channels: [NotificationChannelType.InApp],
    });
    expect(result.ok).toBe(true);
    const [, outbox, decisions] = vi.mocked(notificationRepo.save).mock.calls[0];
    expect(outbox).toEqual([]);
    expect(decisions?.[0]).toMatchObject({
      outcome: NotificationDeliveryPlanOutcome.RateLimited,
      reason: NotificationDeliveryReason.RateLimitHour,
    });
  });

  it('round-trips typed actions into Fact and dispatch payload', async () => {
    const actions = [{
      kind: 'owner-command' as const,
      actionKey: 'complete',
      labelKey: 'routine.action.complete',
      owner: { type: 'routine-occurrence', id: 'occ-1' },
      commandKey: 'routine.complete',
      input: { routineId: 'r-1', occurrenceKey: 'occ-1' },
    }];
    const result = await useCase.execute({
      identityId: anIdentityId(),
      workflowKey: 'routine.intervention',
      title: 'Move',
      content: 'Stand up',
      actions,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.actions).toEqual(actions);
    const [, outbox] = vi.mocked(notificationRepo.save).mock.calls[0];
    expect(JSON.parse(outbox?.[0].payloadJson ?? '{}').actions).toEqual(actions);
  });

  it('uses caller idempotencyKey as a Fact-level fence', async () => {
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
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.title).toBe('Original');
    expect(notificationRepo.save).not.toHaveBeenCalled();
  });

  it('deduplicates repeated requested channels', async () => {
    await useCase.execute({
      identityId: anIdentityId(),
      workflowKey: 'system.general',
      title: 'Duplicate channels',
      content: 'One plan per channel',
      channels: [NotificationChannelType.InApp, NotificationChannelType.InApp],
    });
    const [, outbox, decisions] = vi.mocked(notificationRepo.save).mock.calls[0];
    expect(outbox).toHaveLength(1);
    expect(decisions).toHaveLength(1);
  });

  it('keeps fail-closed account-closure behavior', async () => {
    const closed = new CreateNotificationUseCase(
      notificationRepo,
      preferenceRepo,
      async () => true,
      userTimeContextPort,
    );
    const result = await closed.execute({
      identityId: anIdentityId(),
      workflowKey: 'system.general',
      title: 'Blocked',
      content: 'Blocked',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });
});
