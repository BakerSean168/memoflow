import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { ReminderPreferencesApplicationService } from './reminder-preferences-application-service';
import type { IUserReminderPreferenceRepository } from '../../domain/repositories/i-user-reminder-preference-repository';
import { UserReminderPreferences } from '../../domain/aggregates/user-reminder-preferences';

const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440001';

describe('ReminderPreferencesApplicationService', () => {
  let repository: ReturnType<typeof createMockRepo<IUserReminderPreferenceRepository>>;
  let reminderDomainService: { syncTemplatesEffectiveEnabledByIdentity: ReturnType<typeof vi.fn> };
  let service: ReminderPreferencesApplicationService;

  beforeEach(() => {
    repository = createMockRepo<IUserReminderPreferenceRepository>({
      findByIdentityId: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    });
    reminderDomainService = {
      syncTemplatesEffectiveEnabledByIdentity: vi.fn().mockResolvedValue(undefined),
    };
    service = new ReminderPreferencesApplicationService({
      userReminderPreferenceRepository: repository,
      reminderDomainService: reminderDomainService as never,
    });
  });

  it('returns default preferences when none exist', async () => {
    const result = await service.getPreferences({ identityId: IDENTITY_ID });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.identityId).toBe(IDENTITY_ID);
      expect(result.data.globalReminderEnabled).toBe(true);
    }
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('creates and saves preferences on first update', async () => {
    const result = await service.updatePreferences(
      {
        globalReminderEnabled: false,
      },
      { identityId: IDENTITY_ID },
    );

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(reminderDomainService.syncTemplatesEffectiveEnabledByIdentity).toHaveBeenCalledWith(IDENTITY_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.globalReminderEnabled).toBe(false);
    }
  });

  it('updates existing preferences and syncs template effective flags', async () => {
    const existing = UserReminderPreferences.create({ identityId: IDENTITY_ID });
    (repository.findByIdentityId as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    const result = await service.updatePreferences(
      {
        bestTimeSlots: [{ hourStart: 9, hourEnd: 11, avgResponseRate: 82, sampleCount: 6 }],
        worstTimeSlots: [{ hourStart: 22, hourEnd: 23, avgResponseRate: 15, sampleCount: 2 }],
      },
      { identityId: IDENTITY_ID },
    );

    expect(repository.save).toHaveBeenCalledWith(existing);
    expect(reminderDomainService.syncTemplatesEffectiveEnabledByIdentity).toHaveBeenCalledWith(IDENTITY_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.bestTimeSlots).toHaveLength(1);
      expect(result.data.worstTimeSlots).toHaveLength(1);
    }
  });
});
