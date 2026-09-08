import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateReminderTemplateUseCase } from './update-reminder-template.use-case';
import { ReminderStatus } from '@memoflow/contracts/reminder';

describe('UpdateReminderTemplateUseCase', () => {
  const templateRepository = {
    findByIdForIdentity: vi.fn(),
    save: vi.fn(),
  } as any;

  const groupRepository = {
    findByIdForIdentity: vi.fn(),
  } as any;
  const reminderDomainService = {
    syncTemplateEffectiveEnabled: vi.fn(),
    projectRoutineDefinition: vi.fn(),
    replaceRoutineProfileMemberships: vi.fn(),
  } as any;
  const templateMapper = {
    toDTO: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    reminderDomainService.syncTemplateEffectiveEnabled.mockResolvedValue(undefined);
    reminderDomainService.projectRoutineDefinition.mockResolvedValue(undefined);
    reminderDomainService.replaceRoutineProfileMemberships.mockResolvedValue(undefined);
    templateRepository.save.mockResolvedValue(undefined);
    templateMapper.toDTO.mockResolvedValue({ id: 'tpl-1', name: 'updated' });
  });

  it('returns NOT_FOUND when template does not exist', async () => {
    templateRepository.findByIdForIdentity.mockResolvedValue(null);
    const useCase = new UpdateReminderTemplateUseCase(
      templateRepository,
      groupRepository,
      reminderDomainService,
      templateMapper,
    );

    const result = await useCase.execute('tpl-1', {} as any, { identityId: 'identity-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('returns NOT_FOUND when a requested Profile does not exist', async () => {
    const template = {
      id: 'tpl-1',
      identityId: 'identity-1',
      status: ReminderStatus.Active,
      update: vi.fn(),
    };
    templateRepository.findByIdForIdentity.mockResolvedValue(template);
    reminderDomainService.replaceRoutineProfileMemberships.mockRejectedValueOnce(
      new Error('Routine Profile not found: missing-profile'),
    );
    const useCase = new UpdateReminderTemplateUseCase(
      templateRepository,
      groupRepository,
      reminderDomainService,
      templateMapper,
    );

    const result = await useCase.execute(
      'tpl-1',
      { profileIds: ['missing-profile'] } as any,
      { identityId: 'identity-1' },
    );

    expect(reminderDomainService.replaceRoutineProfileMemberships).toHaveBeenCalledWith(
      template,
      ['missing-profile'],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('updates template without replacing Profile memberships', async () => {
    const update = vi.fn();
    const template = {
      id: 'tpl-1',
      identityId: 'identity-1',
      status: ReminderStatus.Active,
      update,
    };

    templateRepository.findByIdForIdentity.mockResolvedValue(template);
    const useCase = new UpdateReminderTemplateUseCase(
      templateRepository,
      groupRepository,
      reminderDomainService,
      templateMapper,
    );

    const result = await useCase.execute(
      'tpl-1',
      {
        title: 'updated',
        activeTime: { activatedAt: new Date('2026-04-01T00:00:00.000Z').getTime() },
        notificationConfig: {
          channels: ['Push'],
          title: null,
          body: null,
          sound: { enabled: true, soundName: null },
          vibration: { enabled: true, pattern: null },
        },
      } as any,
      { identityId: 'identity-1' },
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'updated',
        activeTime: {
          activatedAt: new Date('2026-04-01T00:00:00.000Z').getTime(),
        },
        notificationConfig: expect.objectContaining({ actions: null }),
      }),
    );
    expect(reminderDomainService.projectRoutineDefinition).toHaveBeenCalledWith(template);
    expect(reminderDomainService.replaceRoutineProfileMemberships).not.toHaveBeenCalled();
    expect(reminderDomainService.syncTemplateEffectiveEnabled).toHaveBeenCalledWith(template);
    expect(templateRepository.save).toHaveBeenCalledWith(template);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ id: 'tpl-1', name: 'updated' });
    }
  });

  it('recalculates effective enabled after replacing the complete Profile membership set', async () => {
    const template = {
      id: 'tpl-1',
      identityId: 'identity-1',
      status: ReminderStatus.Active,
      update: vi.fn(),
    };
    templateRepository.findByIdForIdentity.mockResolvedValue(template);

    const useCase = new UpdateReminderTemplateUseCase(
      templateRepository,
      groupRepository,
      reminderDomainService,
      templateMapper,
    );
    const result = await useCase.execute(
      'tpl-1',
      { profileIds: ['work', 'gaming'] } as any,
      { identityId: 'identity-1' },
    );

    expect(reminderDomainService.replaceRoutineProfileMemberships).toHaveBeenCalledWith(
      template,
      ['work', 'gaming'],
    );
    expect(reminderDomainService.syncTemplateEffectiveEnabled).toHaveBeenCalledWith(template);
    expect(templateRepository.save).toHaveBeenCalledWith(template);
    expect(result.ok).toBe(true);
  });
});
