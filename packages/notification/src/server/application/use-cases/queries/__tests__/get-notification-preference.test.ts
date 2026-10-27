import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { anIdentityId } from '@memoflow/test-utils/fixtures';
import type { INotificationPreferenceRepository } from '../../../../domain/repositories/i-notification-preference-repository';
import { NotificationPreference } from '../../../../domain/aggregates/notification-preference';
import { NotificationChannelType } from '@memoflow/notification-contracts';
import { GetNotificationPreferenceUseCase } from '../get-notification-preference.use-case';

describe('GetNotificationPreferenceUseCase', () => {
  let preferenceRepo: ReturnType<typeof createMockRepo<INotificationPreferenceRepository>>;
  let useCase: GetNotificationPreferenceUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    preferenceRepo = createMockRepo<INotificationPreferenceRepository>({
      findByIdentityId: vi.fn().mockResolvedValue(null),
      getOrCreate: vi.fn(),
    });
    useCase = new GetNotificationPreferenceUseCase(preferenceRepo);
  });

  it('returns null when no user preference document exists', async () => {
    const result = await useCase.execute(anIdentityId());
    expect(result).toEqual({ ok: true, data: null });
  });

  it('returns global and workflow-specific layers', async () => {
    const identityId = anIdentityId();
    const pref = NotificationPreference.create({ identityId });
    pref.setGlobalChannel(NotificationChannelType.Email, false);
    pref.setWorkflowChannelOverride('task.deadline', NotificationChannelType.Desktop, true);
    vi.mocked(preferenceRepo.findByIdentityId).mockResolvedValue(pref);
    const result = await useCase.execute(identityId);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) throw new Error('expected preference');
    expect(result.data.identityId).toBe(identityId);
    expect(result.data.globalChannels).toEqual({ Email: false });
    expect(result.data.workflowOverrides).toEqual({ 'task.deadline': { Desktop: true } });
    expect(result.data).not.toHaveProperty('settings');
  });

  it('calls the repository with identity scope', async () => {
    const identityId = anIdentityId();
    await useCase.execute(identityId);
    expect(preferenceRepo.findByIdentityId).toHaveBeenCalledWith(identityId);
  });

  it('executeOrCreate returns a deterministic empty user layer when first created', async () => {
    const identityId = anIdentityId();
    const pref = NotificationPreference.create({ identityId });
    vi.mocked(preferenceRepo.getOrCreate).mockResolvedValue(pref);
    const result = await useCase.executeOrCreate(identityId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.identityId).toBe(identityId);
    expect(result.data.globalChannels).toEqual({});
    expect(result.data.workflowOverrides).toEqual({});
    expect(preferenceRepo.getOrCreate).toHaveBeenCalledWith(identityId);
  });
});
