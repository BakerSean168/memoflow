import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { anIdentityId } from '@memoflow/test-utils/fixtures';
import { NotificationChannelType } from '@memoflow/contracts/notification';
import type { INotificationPreferenceRepository } from '../../../../domain/repositories';
import { NotificationPreference } from '../../../../domain/aggregates/notification-preference';
import { UpdateNotificationPreferenceUseCase } from '../update-notification-preference.use-case';

describe('UpdateNotificationPreferenceUseCase', () => {
  let preferenceRepo: ReturnType<typeof createMockRepo<INotificationPreferenceRepository>>;
  let useCase: UpdateNotificationPreferenceUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    preferenceRepo = createMockRepo<INotificationPreferenceRepository>({
      getOrCreate: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new UpdateNotificationPreferenceUseCase(preferenceRepo);
  });

  it('updates global and workflow user choices independently', async () => {
    const identityId = anIdentityId();
    const preference = NotificationPreference.create({ identityId });
    vi.mocked(preferenceRepo.getOrCreate).mockResolvedValue(preference);
    const result = await useCase.execute(identityId, {
      globalChannels: { InApp: true, Email: false },
      workflowOverrides: {
        'task.deadline': { Desktop: true, Email: false },
      },
    });
    expect(result.ok).toBe(true);
    expect(preference.getGlobalChannel(NotificationChannelType.InApp)).toBe(true);
    expect(preference.getGlobalChannel(NotificationChannelType.Email)).toBe(false);
    expect(preference.getWorkflowChannelOverride('task.deadline', NotificationChannelType.Desktop)).toBe(true);
    expect(preferenceRepo.save).toHaveBeenCalledWith(preference);
  });

  it('persists explicit-timezone QuietHours and exposes no user rate-limit knob', async () => {
    const identityId = anIdentityId();
    const preference = NotificationPreference.create({ identityId });
    vi.mocked(preferenceRepo.getOrCreate).mockResolvedValue(preference);
    const result = await useCase.execute(identityId, {
      quietHours: {
        enabled: true,
        timeZone: 'Asia/Tokyo' as never,
        weeklyWindows: [{ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], start: '22:00', end: '08:00' }],
      },
    });
    expect(result.ok).toBe(true);
    expect(preference.quietHours?.toDTO()).toMatchObject({
      enabled: true,
      timeZone: 'Asia/Tokyo',
      weeklyWindows: [{ start: '22:00', end: '08:00' }],
    });
    expect(preference.toServerDTO()).not.toHaveProperty('rateLimit');
  });

  it('clears QuietHours explicitly', async () => {
    const identityId = anIdentityId();
    const preference = NotificationPreference.create({ identityId });
    vi.mocked(preferenceRepo.getOrCreate).mockResolvedValue(preference);
    const result = await useCase.execute(identityId, { quietHours: null });
    expect(result.ok).toBe(true);
    expect(preference.quietHours).toBeNull();
  });

  it('returns BAD_REQUEST when identityId is empty', async () => {
    const result = await useCase.execute('', { globalChannels: { InApp: true } });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.code).toBe('BAD_REQUEST');
    expect(preferenceRepo.getOrCreate).not.toHaveBeenCalled();
  });
});
