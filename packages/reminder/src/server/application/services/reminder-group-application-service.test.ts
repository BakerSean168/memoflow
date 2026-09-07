import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { ReminderGroupApplicationService } from './reminder-group-application-service';
import type { IReminderGroupRepository } from '../../domain/repositories/i-reminder-group-repository';
import type { IReminderTemplateRepository } from '../../domain/repositories/i-reminder-template-repository';
import { ReminderGroup } from '../../domain/aggregates/reminder-group';
import type { ReminderGroupState } from '../../domain/aggregates/reminder-group';
import { ReminderStatus } from '@memoflow/contracts/reminder';
import { GroupStats } from '../../domain/value-objects/group-stats';
import { generateUUID } from '@memoflow/utils/shared';

const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440001';

function makeGroupState(overrides: Partial<ReminderGroupState> = {}): ReminderGroupState {
  const now = new Date();
  return {
    id: generateUUID(),
    identityId: IDENTITY_ID,
    name: 'Work',
    description: null,
    enabled: true,
    status: ReminderStatus.Active,
    order: 0,
    color: null,
    icon: null,
    stats: GroupStats.createEmpty(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    ...overrides,
  };
}

describe('ReminderGroupApplicationService', () => {
  let groupRepository: ReturnType<typeof createMockRepo<IReminderGroupRepository>>;
  let templateRepository: ReturnType<typeof createMockRepo<IReminderTemplateRepository>>;
  let reminderDomainService: {
    createReminderGroup: ReturnType<typeof vi.fn>;
    syncTemplateEffectiveEnabled: ReturnType<typeof vi.fn>;
    syncTemplatesEffectiveEnabledByGroup: ReturnType<typeof vi.fn>;
    deleteGroup: ReturnType<typeof vi.fn>;
    updateGroupStats: ReturnType<typeof vi.fn>;
    toggleGroupAndTemplates: ReturnType<typeof vi.fn>;
    projectRoutineProfile: ReturnType<typeof vi.fn>;
    projectRoutineDefinition: ReturnType<typeof vi.fn>;
  };
  let service: ReminderGroupApplicationService;

  beforeEach(() => {
    groupRepository = createMockRepo<IReminderGroupRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
      findByIdentityId: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
    });
    templateRepository = createMockRepo<IReminderTemplateRepository>({
      findByGroupId: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
    });
    reminderDomainService = {
      createReminderGroup: vi.fn(),
      syncTemplateEffectiveEnabled: vi.fn().mockResolvedValue(undefined),
      syncTemplatesEffectiveEnabledByGroup: vi.fn().mockResolvedValue(undefined),
      deleteGroup: vi.fn().mockResolvedValue(undefined),
      updateGroupStats: vi.fn().mockResolvedValue(undefined),
      toggleGroupAndTemplates: vi.fn(),
      projectRoutineProfile: vi.fn().mockResolvedValue(undefined),
      projectRoutineDefinition: vi.fn().mockResolvedValue(undefined),
    };
    service = new ReminderGroupApplicationService({
      reminderGroupRepository: groupRepository,
      reminderTemplateRepository: templateRepository,
      reminderDomainService: reminderDomainService as never,
    });
  });

  it('injects identity when creating a group', async () => {
    const group = ReminderGroup.load(makeGroupState({ name: 'Medicine' }));
    reminderDomainService.createReminderGroup.mockResolvedValue(group);

    const result = await service.createGroup({ name: 'Medicine' }, { identityId: IDENTITY_ID });

    expect(reminderDomainService.createReminderGroup).toHaveBeenCalledWith({
      identityId: IDENTITY_ID,
      name: 'Medicine',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('Medicine');
    }
  });

  it('returns NOT_FOUND instead of throwing when updating a missing group', async () => {
    const result = await service.updateGroup('missing', { name: 'Updated' }, { identityId: IDENTITY_ID });

    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Group not found' },
    });
  });

  it('updates group state and syncs template effective flags', async () => {
    const existing = ReminderGroup.load(makeGroupState({ name: 'Original', description: 'old' }));
    (groupRepository.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    const result = await service.updateGroup(
      existing.id,
      { name: 'Updated' },
      { identityId: IDENTITY_ID },
    );

    expect(groupRepository.save).toHaveBeenCalledTimes(1);
    expect(reminderDomainService.projectRoutineProfile).toHaveBeenCalledTimes(1);
    expect(reminderDomainService.syncTemplatesEffectiveEnabledByGroup).toHaveBeenCalledWith(IDENTITY_ID, existing.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('Updated');
    }
  });

  it('batches template state changes through repositories and domain sync', async () => {
    const group = ReminderGroup.load(makeGroupState());
    (groupRepository.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(group);
    const ownedTemplate = {
      id: 'template-1',
      identityId: IDENTITY_ID,
      enable: vi.fn(),
      pause: vi.fn(),
    };
    (templateRepository.findByGroupId as ReturnType<typeof vi.fn>).mockResolvedValue([
      ownedTemplate,
    ]);

    const result = await service.batchGroupTemplates(
      group.id,
      { action: 'ENABLE' },
      { identityId: IDENTITY_ID },
    );

    expect(templateRepository.findByGroupId).toHaveBeenCalledWith(group.id, IDENTITY_ID);
    expect(ownedTemplate.enable).toHaveBeenCalledTimes(1);
    expect(reminderDomainService.syncTemplateEffectiveEnabled).toHaveBeenCalledTimes(1);
    expect(templateRepository.save).toHaveBeenCalledTimes(1);
    expect(reminderDomainService.projectRoutineDefinition).toHaveBeenCalledWith(ownedTemplate);
    expect(reminderDomainService.updateGroupStats).toHaveBeenCalledWith(IDENTITY_ID, group.id);
    expect(result).toEqual({ ok: true, data: { successCount: 1, failedCount: 0 } });
  });
});
