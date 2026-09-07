import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IReminderTemplateRepository } from '../../domain/repositories/i-reminder-template-repository';
import { ReminderTemplateActionApplicationService } from './reminder-template-action-application-service';
import { ReminderTemplateClientMapper } from '../mappers/reminder-template-client.mapper';

const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440001';

function createTemplate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'template-1',
    identityId: IDENTITY_ID,
    enable: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    getAllHistory: vi.fn().mockReturnValue([]),
    ...overrides,
  };
}

describe('ReminderTemplateActionApplicationService', () => {
  let reminderTemplateRepository: ReturnType<typeof createMockRepo<IReminderTemplateRepository>>;
  let reminderDomainService: {
    syncTemplateEffectiveEnabled: ReturnType<typeof vi.fn>;
    updateProfileStatsForRoutine: ReturnType<typeof vi.fn>;
    replaceRoutineProfileMemberships: ReturnType<typeof vi.fn>;
    projectRoutineDefinition: ReturnType<typeof vi.fn>;
  };
  let templateMapper: { toDTO: ReturnType<typeof vi.fn> };
  let service: ReminderTemplateActionApplicationService;

  beforeEach(() => {
    reminderTemplateRepository = createMockRepo<IReminderTemplateRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    });
    reminderDomainService = {
      syncTemplateEffectiveEnabled: vi.fn().mockResolvedValue(undefined),
      updateProfileStatsForRoutine: vi.fn().mockResolvedValue(undefined),
      replaceRoutineProfileMemberships: vi.fn().mockResolvedValue(undefined),
      projectRoutineDefinition: vi.fn().mockResolvedValue(undefined),
    };
    templateMapper = {
      toDTO: vi.fn(),
    };
    service = new ReminderTemplateActionApplicationService({
      reminderTemplateRepository,
      reminderDomainService: reminderDomainService as never,
      templateMapper: templateMapper as unknown as ReminderTemplateClientMapper,
    });
  });

  it('enables a template and returns mapped DTO', async () => {
    const template = createTemplate();
    const dto = { id: 'template-1', name: 'Drink water' };
    (reminderTemplateRepository.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(template);
    templateMapper.toDTO.mockResolvedValue(dto);

    const result = await service.enableTemplate('template-1', { identityId: IDENTITY_ID });

    expect(template.enable).toHaveBeenCalledTimes(1);
    expect(reminderDomainService.syncTemplateEffectiveEnabled).toHaveBeenCalledWith(template);
    expect(reminderTemplateRepository.save).toHaveBeenCalledWith(template);
    expect(reminderDomainService.projectRoutineDefinition).toHaveBeenCalledWith(template);
    expect(reminderDomainService.updateProfileStatsForRoutine).toHaveBeenCalledWith(IDENTITY_ID, 'template-1');
    expect(result).toEqual({ ok: true, data: dto });
  });

  it('replaces the complete Profile membership set without mutating Routine-owned state', async () => {
    const template = createTemplate();
    const dto = {
      id: 'template-1',
      profileMemberships: [
        { profileId: 'work', profileName: 'Work', membershipEnabled: true, profileEnabled: true, profileActive: true },
        { profileId: 'gaming', profileName: 'Gaming', membershipEnabled: true, profileEnabled: true, profileActive: true },
      ],
    };
    (reminderTemplateRepository.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(template);
    templateMapper.toDTO.mockResolvedValue(dto);

    const result = await service.replaceTemplateProfiles(
      'template-1',
      ['work', 'gaming'],
      { identityId: IDENTITY_ID },
    );

    expect(reminderDomainService.replaceRoutineProfileMemberships).toHaveBeenCalledWith(
      template,
      ['work', 'gaming'],
    );
    expect(reminderDomainService.syncTemplateEffectiveEnabled).toHaveBeenCalledWith(template);
    expect(reminderTemplateRepository.save).toHaveBeenCalledWith(template);
    expect(reminderDomainService.updateProfileStatsForRoutine).toHaveBeenCalledWith(
      IDENTITY_ID,
      'template-1',
    );
    expect(result).toEqual({ ok: true, data: dto });
  });


  it('returns template history as client DTOs', async () => {
    const historyA = { toClientDTO: vi.fn().mockReturnValue({ id: 'history-1' }) };
    const historyB = { toClientDTO: vi.fn().mockReturnValue({ id: 'history-2' }) };
    const template = createTemplate({
      getAllHistory: vi.fn().mockReturnValue([historyA, historyB]),
    });
    (reminderTemplateRepository.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(template);

    const result = await service.getTemplateHistory('template-1', { identityId: IDENTITY_ID });

    expect(result).toEqual({
      ok: true,
      data: [{ id: 'history-1' }, { id: 'history-2' }],
    });
  });
});