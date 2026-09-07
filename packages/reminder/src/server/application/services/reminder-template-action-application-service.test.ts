import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IReminderGroupRepository } from '../../domain/repositories/i-reminder-group-repository';
import type { IReminderTemplateRepository } from '../../domain/repositories/i-reminder-template-repository';
import { ReminderTemplateActionApplicationService } from './reminder-template-action-application-service';
import { ReminderTemplateClientMapper } from '../mappers/reminder-template-client.mapper';

const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440001';

function createTemplate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'template-1',
    identityId: IDENTITY_ID,
    groupId: 'group-1',
    enable: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    getAllHistory: vi.fn().mockReturnValue([]),
    ...overrides,
  };
}

describe('ReminderTemplateActionApplicationService', () => {
  let reminderTemplateRepository: ReturnType<typeof createMockRepo<IReminderTemplateRepository>>;
  let reminderGroupRepository: ReturnType<typeof createMockRepo<IReminderGroupRepository>>;
  let reminderDomainService: {
    syncTemplateEffectiveEnabled: ReturnType<typeof vi.fn>;
    updateGroupStats: ReturnType<typeof vi.fn>;
    assignTemplateToGroup: ReturnType<typeof vi.fn>;
    projectRoutineDefinition: ReturnType<typeof vi.fn>;
  };
  let templateMapper: { toDTO: ReturnType<typeof vi.fn> };
  let service: ReminderTemplateActionApplicationService;

  beforeEach(() => {
    reminderTemplateRepository = createMockRepo<IReminderTemplateRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    });
    reminderGroupRepository = createMockRepo<IReminderGroupRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
    });
    reminderDomainService = {
      syncTemplateEffectiveEnabled: vi.fn().mockResolvedValue(undefined),
      updateGroupStats: vi.fn().mockResolvedValue(undefined),
      assignTemplateToGroup: vi.fn(),
      projectRoutineDefinition: vi.fn().mockResolvedValue(undefined),
    };
    templateMapper = {
      toDTO: vi.fn(),
    };
    service = new ReminderTemplateActionApplicationService({
      reminderTemplateRepository,
      reminderGroupRepository,
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
    expect(reminderDomainService.updateGroupStats).toHaveBeenCalledWith(IDENTITY_ID, 'group-1');
    expect(result).toEqual({ ok: true, data: dto });
  });

  it('delegates template move to domain service without duplicate stats sync in the facade layer', async () => {
    const template = createTemplate({ groupId: 'group-old' });
    const targetGroup = { id: 'group-new', identityId: IDENTITY_ID };
    const movedTemplate = createTemplate({ groupId: 'group-new' });
    const dto = { id: 'template-1', groupId: 'group-new' };
    (reminderTemplateRepository.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(template);
    (reminderGroupRepository.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(targetGroup);
    reminderDomainService.assignTemplateToGroup.mockResolvedValue(movedTemplate);
    templateMapper.toDTO.mockResolvedValue(dto);

    const result = await service.moveTemplate('template-1', 'group-new', { identityId: IDENTITY_ID });

    expect(reminderDomainService.assignTemplateToGroup).toHaveBeenCalledWith(IDENTITY_ID, 'template-1', 'group-new');
    expect(reminderDomainService.updateGroupStats).not.toHaveBeenCalled();
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