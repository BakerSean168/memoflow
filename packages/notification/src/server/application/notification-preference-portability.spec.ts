import { describe, expect, it, vi } from 'vitest';
import { NotificationChannelType } from '@memoflow/contracts/notification';
import { asHm, requireTimeZoneId } from '@memoflow/time';
import { NotificationPreference } from '../domain/aggregates/notification-preference';
import type { INotificationPreferenceRepository } from '../domain/repositories';
import { QuietHours } from '../domain/value-objects/quiet-hours';
import {
  NotificationDeliveryPreferencePortableService,
  createNotificationDeliveryPreferencePortableCapability,
} from './notification-preference-portability';

function createRepository(initial: NotificationPreference | null = null) {
  let current = initial;
  const repository: INotificationPreferenceRepository = {
    save: vi.fn(async (preference) => { current = preference; }),
    findByIdForIdentity: vi.fn(async (identityId, id) =>
      current && current.identityId === identityId && current.id === id ? current : null),
    findByIdentityId: vi.fn(async (identityId) =>
      current && current.identityId === identityId ? current : null),
    delete: vi.fn(async () => { current = null; }),
    exists: vi.fn(async (identityId, id) => Boolean(current && current.identityId === identityId && current.id === id)),
    existsForIdentity: vi.fn(async (identityId) => Boolean(current && current.identityId === identityId)),
    getOrCreate: vi.fn(async (identityId) => {
      current ??= NotificationPreference.create({ identityId: identityId as never });
      return current;
    }),
  };
  return { repository, get current() { return current; } };
}

const target = {
  globalChannels: { InApp: true, Email: false, Push: true },
  workflowOverrides: { 'task.deadline': { Email: true, Desktop: true } },
} as const;

function quietHours() {
  return QuietHours.create({
    enabled: true,
    timeZone: requireTimeZoneId('Asia/Tokyo'),
    weeklyWindows: [{ daysOfWeek: [1, 2, 3, 4, 5], start: asHm('23:00'), end: asHm('07:00') }],
  });
}

describe('Notification delivery preference portability', () => {
  it('exports only stable delivery choices and leaves QuietHours for PORT-1610B', async () => {
    const preference = NotificationPreference.create({ identityId: 'identity-a' as never });
    preference.setGlobalChannel(NotificationChannelType.Email, false);
    preference.setWorkflowChannelOverride('task.deadline', NotificationChannelType.Desktop, true);
    preference.setQuietHours(quietHours());
    const state = createRepository(preference);

    const payload = await new NotificationDeliveryPreferencePortableService(state.repository).export('identity-a');
    expect(payload).toEqual({
      globalChannels: { Email: false },
      workflowOverrides: { 'task.deadline': { Desktop: true } },
    });
    expect(payload).not.toHaveProperty('identityId');
    expect(payload).not.toHaveProperty('quietHours');
    expect(payload).not.toHaveProperty('rateLimit');
  });

  it('omits the capability when the owner has no persisted preference', async () => {
    const state = createRepository();
    const service = new NotificationDeliveryPreferencePortableService(state.repository);
    await expect(service.export('identity-a')).resolves.toBeNull();
    expect(state.repository.getOrCreate).not.toHaveBeenCalled();
  });

  it('dry-runs without materializing a missing preference', async () => {
    const state = createRepository();
    const service = new NotificationDeliveryPreferencePortableService(state.repository);
    await expect(service.dryRun('identity-target', target)).resolves.toEqual({
      created: 1, updated: 0, skipped: 0, warnings: [],
    });
    expect(state.current).toBeNull();
  });

  it('replaces stable delivery choices while preserving QuietHours owner state', async () => {
    const preference = NotificationPreference.create({ identityId: 'identity-target' as never });
    preference.setGlobalChannel(NotificationChannelType.Webhook, true);
    preference.setWorkflowChannelOverride('legacy.workflow', NotificationChannelType.Sms, true);
    const quiet = quietHours();
    preference.setQuietHours(quiet);
    const state = createRepository(preference);
    const service = new NotificationDeliveryPreferencePortableService(state.repository);

    await expect(service.apply('identity-target', target)).resolves.toEqual({
      created: 0, updated: 1, skipped: 0, warnings: [],
    });
    expect(state.current?.getGlobalChannel(NotificationChannelType.Webhook)).toBeUndefined();
    expect(state.current?.getGlobalChannel(NotificationChannelType.Email)).toBe(false);
    expect(state.current?.getWorkflowChannelOverride('legacy.workflow', NotificationChannelType.Sms)).toBeUndefined();
    expect(state.current?.getWorkflowChannelOverride('task.deadline', NotificationChannelType.Desktop)).toBe(true);
    expect(state.current?.quietHours?.toDTO()).toEqual(quiet.toDTO());
  });

  it('uses host-owned identity when applying a capability payload', async () => {
    const state = createRepository();
    const capability = createNotificationDeliveryPreferencePortableCapability(state.repository);
    const context = { identityId: 'identity-host', references: {} as never };
    expect(capability.key).toBe('notification-delivery-preferences');
    expect(capability.schemaVersion).toBe(3);
    await expect(capability.apply(target, context)).resolves.toMatchObject({ created: 1 });
    expect(state.current?.identityId).toBe('identity-host');
  });

  it('skips an idempotent re-apply of the same stable payload', async () => {
    const state = createRepository();
    const service = new NotificationDeliveryPreferencePortableService(state.repository);
    await service.apply('identity-target', target);
    vi.mocked(state.repository.save).mockClear();
    await expect(service.apply('identity-target', target)).resolves.toEqual({
      created: 0, updated: 0, skipped: 1, warnings: [],
    });
    expect(state.repository.save).not.toHaveBeenCalled();
  });
});
