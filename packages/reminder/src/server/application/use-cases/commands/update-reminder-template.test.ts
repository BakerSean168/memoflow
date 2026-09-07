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
    updateGroupStats: vi.fn(),
  } as any;
  const templateMapper = {
    toDTO: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('returns NOT_FOUND when group id is provided but group not found', async () => {
    templateRepository.findByIdForIdentity.mockResolvedValue({
      identityId: 'identity-1',
      update: vi.fn(),
      setEffectiveEnabled: vi.fn(),
      toClientDTO: vi.fn().mockReturnValue({ id: 'tpl-1' }),
    });
    groupRepository.findByIdForIdentity.mockResolvedValue(null);
    const useCase = new UpdateReminderTemplateUseCase(
      templateRepository,
      groupRepository,
      reminderDomainService,
      templateMapper,
    );

    const result = await useCase.execute('tpl-1', {
      groupId: 'group-1',
    } as any, { identityId: 'identity-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('updates template without group reassignment', async () => {
    const update = vi.fn();
    const setEffectiveEnabled = vi.fn();

    templateRepository.findByIdForIdentity.mockResolvedValue({
      id: 'tpl-1',
      identityId: 'identity-1',
      groupId: null,
      status: ReminderStatus.Active,
      update,
      setEffectiveEnabled,
    });
    templateRepository.save.mockResolvedValue(undefined);
    const useCase = new UpdateReminderTemplateUseCase(
      templateRepository,
      groupRepository,
      reminderDomainService,
      templateMapper,
    );

    const result = await useCase.execute('tpl-1', {
      title: 'updated',
      activeTime: { activatedAt: new Date('2026-04-01T00:00:00.000Z').getTime() },
      notificationConfig: {
        channels: ['Push'],
        title: null,
        body: null,
        sound: { enabled: true, soundName: null },
        vibration: { enabled: true, pattern: null },
      },
    } as any, { identityId: 'identity-1' });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'updated',
        activeTime: {
          activatedAt: new Date('2026-04-01T00:00:00.000Z').getTime(),
        },
        notificationConfig: expect.objectContaining({
          actions: null,
        }),
      }),
    );
    expect(reminderDomainService.syncTemplateEffectiveEnabled).toHaveBeenCalledTimes(1);
    expect(templateRepository.save).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ id: 'tpl-1', name: 'updated' });
    }
  });

  it('recalculates effective enabled when group reassigned', async () => {
    const setEffectiveEnabled = vi.fn();
    const template = {
      id: 'tpl-1',
      identityId: 'identity-1',
      groupId: null as string | null,
      status: ReminderStatus.Active,
      setEffectiveEnabled,
      update: vi.fn((patch: { groupId?: string | null }) => {
        if (patch.groupId !== undefined) {
          template.groupId = patch.groupId;
        }
      }),
    };

    templateRepository.findByIdForIdentity.mockResolvedValue(template);

    groupRepository.findByIdForIdentity.mockResolvedValue({
      id: 'group-1',
      identityId: 'identity-1',
      status: ReminderStatus.Active,
    });

    const useCase = new UpdateReminderTemplateUseCase(
      templateRepository,
      groupRepository,
      reminderDomainService,
      templateMapper,
    );
    await useCase.execute('tpl-1', { groupId: 'group-1' } as any, { identityId: 'identity-1' });

    expect(groupRepository.findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'group-1');
    expect(template.update).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
      }),
    );
    expect(reminderDomainService.syncTemplateEffectiveEnabled).toHaveBeenCalledTimes(1);
    expect(reminderDomainService.updateGroupStats).toHaveBeenCalledWith(expect.any(String), 'group-1');
  });
});
