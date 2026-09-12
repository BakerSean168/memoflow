import { describe, expect, it, vi } from 'vitest';
import { NotificationChannelType } from '@memoflow/contracts/notification';
import { NotificationPreference } from '../domain/aggregates/notification-preference';
import type { INotificationPreferenceRepository } from '../domain/repositories';
import { DoNotDisturbConfig } from '../domain/value-objects/do-not-disturb-config';
import { RateLimit } from '../domain/value-objects/rate-limit';
import {
  NotificationDeliveryPreferencePortableService,
  createNotificationDeliveryPreferencePortableCapability,
} from './notification-preference-portability';

function createRepository(initial: NotificationPreference | null = null) {
  let current = initial;
  const repository: INotificationPreferenceRepository = {
    save: vi.fn(async (preference) => {
      current = preference;
    }),
    findByIdForIdentity: vi.fn(async (identityId, id) =>
      current && current.identityId === identityId && current.id === id ? current : null,
    ),
    findByIdentityId: vi.fn(async (identityId) =>
      current && current.identityId === identityId ? current : null,
    ),
    delete: vi.fn(async () => {
      current = null;
    }),
    exists: vi.fn(async (identityId, id) =>
      Boolean(current && current.identityId === identityId && current.id === id),
    ),
    existsForIdentity: vi.fn(async (identityId) =>
      Boolean(current && current.identityId === identityId),
    ),
    getOrCreate: vi.fn(async (identityId) => {
      current ??= NotificationPreference.create({ identityId: identityId as never });
      return current;
    }),
  };
  return {
    repository,
    get current() {
      return current;
    },
  };
}

const target = {
  globalChannels: { InApp: true, Email: false, Push: true },
  workflowOverrides: {
    'task.deadline': { Email: true, Desktop: true },
  },
} as const;

describe('Notification delivery preference portability', () => {
  it('exports only stable delivery choices and omits persistence/device/pending ADR-088 fields', async () => {
    const preference = NotificationPreference.create({ identityId: 'identity-a' as never });
    preference.setGlobalChannel(NotificationChannelType.Email, false);
    preference.setWorkflowChannelOverride('task.deadline', NotificationChannelType.Desktop, true);
    preference.setDoNotDisturb(
      DoNotDisturbConfig.create({
        enabled: true,
        startTime: '22:00',
        endTime: '08:00',
        daysOfWeek: [1],
      }),
    );
    preference.setRateLimit(RateLimit.create({ enabled: true, maxPerHour: 2, maxPerDay: 10 }));
    const state = createRepository(preference);

    const payload = await new NotificationDeliveryPreferencePortableService(
      state.repository,
    ).export('identity-a');

    expect(payload).toEqual({
      globalChannels: { Email: false },
      workflowOverrides: { 'task.deadline': { Desktop: true } },
    });
    expect(payload).not.toHaveProperty('identityId');
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('version');
    expect(payload).not.toHaveProperty('doNotDisturb');
    expect(payload).not.toHaveProperty('rateLimit');
  });

  it('omits the capability when the owner has no persisted delivery preference', async () => {
    const state = createRepository();
    const service = new NotificationDeliveryPreferencePortableService(state.repository);

    await expect(service.export('identity-a')).resolves.toBeNull();
    expect(state.repository.save).not.toHaveBeenCalled();
    expect(state.repository.getOrCreate).not.toHaveBeenCalled();
  });

  it('dry-runs without materializing a missing preference', async () => {
    const state = createRepository();
    const service = new NotificationDeliveryPreferencePortableService(state.repository);

    await expect(service.dryRun('identity-target', target)).resolves.toEqual({
      created: 1,
      updated: 0,
      skipped: 0,
      warnings: [],
    });
    expect(state.current).toBeNull();
    expect(state.repository.save).not.toHaveBeenCalled();
    expect(state.repository.getOrCreate).not.toHaveBeenCalled();
  });

  it('replaces stable delivery choices while preserving pending QuietHours/SystemDeliveryGuard fields', async () => {
    const preference = NotificationPreference.create({ identityId: 'identity-target' as never });
    preference.setGlobalChannel(NotificationChannelType.Webhook, true);
    preference.setWorkflowChannelOverride('legacy.workflow', NotificationChannelType.Sms, true);
    const dnd = DoNotDisturbConfig.create({
      enabled: true,
      startTime: '23:00',
      endTime: '07:00',
      daysOfWeek: [1, 2, 3, 4, 5],
    });
    const rateLimit = RateLimit.create({ enabled: true, maxPerHour: 3, maxPerDay: 20 });
    preference.setDoNotDisturb(dnd);
    preference.setRateLimit(rateLimit);
    const state = createRepository(preference);
    const service = new NotificationDeliveryPreferencePortableService(state.repository);

    await expect(service.apply('identity-target', target)).resolves.toEqual({
      created: 0,
      updated: 1,
      skipped: 0,
      warnings: [],
    });

    expect(state.current?.getGlobalChannel(NotificationChannelType.Webhook)).toBeUndefined();
    expect(state.current?.getGlobalChannel(NotificationChannelType.Email)).toBe(false);
    expect(
      state.current?.getWorkflowChannelOverride('legacy.workflow', NotificationChannelType.Sms),
    ).toBeUndefined();
    expect(
      state.current?.getWorkflowChannelOverride('task.deadline', NotificationChannelType.Desktop),
    ).toBe(true);
    expect(state.current?.doNotDisturb?.toDTO()).toEqual(dnd.toDTO());
    expect(state.current?.rateLimit?.toDTO()).toEqual(rateLimit.toDTO());
  });

  it('uses host-owned identity when applying a capability payload', async () => {
    const state = createRepository();
    const capability = createNotificationDeliveryPreferencePortableCapability(state.repository);
    const context = { identityId: 'identity-host', references: {} as never };

    expect(capability.key).toBe('notification-delivery-preferences');
    expect(capability.schemaVersion).toBe(3);
    await expect(capability.apply(target, context)).resolves.toEqual({
      created: 1,
      updated: 0,
      skipped: 0,
      warnings: [],
    });
    expect(state.current?.identityId).toBe('identity-host');
    expect(state.current?.getGlobalChannel(NotificationChannelType.Email)).toBe(false);
  });

  it('skips an idempotent re-apply of the same stable payload', async () => {
    const state = createRepository();
    const service = new NotificationDeliveryPreferencePortableService(state.repository);
    await service.apply('identity-target', target);
    vi.mocked(state.repository.save).mockClear();

    await expect(service.apply('identity-target', target)).resolves.toEqual({
      created: 0,
      updated: 0,
      skipped: 1,
      warnings: [],
    });
    expect(state.repository.save).not.toHaveBeenCalled();
  });
});
