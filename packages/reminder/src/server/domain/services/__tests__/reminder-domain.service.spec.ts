import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IReminderTemplateRepository } from '../../repositories/i-reminder-template-repository';
import type { IReminderGroupRepository } from '../../repositories/i-reminder-group-repository';
import { ReminderDomainService } from '../reminder-domain-service';
import { ReminderTemplate } from '../../aggregates/reminder-template';
import type { ReminderTemplateState } from '../../aggregates/reminder-template';
import { ReminderGroup } from '../../aggregates/reminder-group';
import type { ReminderGroupState } from '../../aggregates/reminder-group';
import { ReminderStatus, ReminderType } from '@memoflow/contracts/reminder';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { ReminderTemplateId } from '../../value-objects/reminder-template-id';
import { IdentityId } from '@memoflow/domain-shared';
import { TriggerConfig, ActiveTimeConfig, GroupStats } from '../../value-objects';
import { ReminderNotificationConfig } from '../../value-objects/reminder-notification-config';
import { generateUUID } from '@memoflow/utils/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IDENTITY_ID = IdentityId.generate();

function makeTemplateState(overrides: Partial<ReminderTemplateState> = {}): ReminderTemplateState {
  const now = Date.now();
  return {
    id: ReminderTemplateId.generate(),
    identityId: IdentityId.of(IDENTITY_ID),
    title: 'Domain Svc Test',
    description: null,
    type: ReminderType.Recurring,
    trigger: TriggerConfig.createFixedTime('08:00'),
    activeTime: ActiveTimeConfig.createAt(now),
    activeHours: null,
    notificationConfig: ReminderNotificationConfig.createDefault(),
    selfEnabled: true,
    status: ReminderStatus.Active,
    groupId: null,
    effectiveEnabled: true,
    importanceLevel: ImportanceLevel.Moderate,
    tags: [],
    color: null,
    icon: null,
    nextTriggerAt: now + 3_600_000,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    deletedAt: null,
    version: 1,
    responseMetrics: null,
    frequencyAdjustment: null,
    smartFrequencyEnabled: true,
    history: [],
    ...overrides,
  };
}

function makeGroupState(overrides: Partial<ReminderGroupState> = {}): ReminderGroupState {
  const now = new Date();
  return {
    id: generateUUID(),
    identityId: IDENTITY_ID,
    name: 'Domain Svc Group',
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

// ===========================================================================
// Tests
// ===========================================================================

describe('ReminderDomainService', () => {
  let templateRepo: ReturnType<typeof createMockRepo<IReminderTemplateRepository>>;
  let groupRepo: ReturnType<typeof createMockRepo<IReminderGroupRepository>>;
  let service: ReminderDomainService;

  beforeEach(() => {
    vi.clearAllMocks();
    templateRepo = createMockRepo<IReminderTemplateRepository>({
      save: vi.fn().mockResolvedValue(undefined),
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
      findByGroupId: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    groupRepo = createMockRepo<IReminderGroupRepository>({
      save: vi.fn().mockResolvedValue(undefined),
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
      findByName: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    service = new ReminderDomainService(templateRepo, groupRepo);
  });

  // -----------------------------------------------------------------------
  // createReminderTemplate()
  // -----------------------------------------------------------------------
  describe('createReminderTemplate()', () => {
    it('should create and save a template', async () => {
      const result = await service.createReminderTemplate({
        identityId: IDENTITY_ID,
        title: 'New Template',
        type: ReminderType.Recurring,
        trigger: {
          type: 'FixedTime',
          fixedTime: { time: '09:00', timezone: null },
          interval: null,
        },
        activeTime: { activatedAt: Date.now() },
        notificationConfig: {
          channels: ['InApp'],
          title: null,
          body: null,
          sound: null,
          vibration: null,
          actions: null,
        },
      });

      expect(result).toBeDefined();
      expect(result.title).toBe('New Template');
      expect(templateRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should throw when groupId does not exist', async () => {
      (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        service.createReminderTemplate({
          identityId: IDENTITY_ID,
          title: 'With Group',
          type: ReminderType.Recurring,
          trigger: {
            type: 'FixedTime',
            fixedTime: { time: '09:00', timezone: null },
            interval: null,
          },
          activeTime: { activatedAt: Date.now() },
          notificationConfig: {
            channels: ['InApp'],
            title: null,
            body: null,
            sound: null,
            vibration: null,
            actions: null,
          },
          groupId: 'non-existent',
        }),
      ).rejects.toThrow('Invalid groupId');
    });

    it('should throw when owned group lookup returns null (cross-identity)', async () => {
      (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        service.createReminderTemplate({
          identityId: IDENTITY_ID,
          title: 'Mismatched',
          type: ReminderType.Recurring,
          trigger: {
            type: 'FixedTime',
            fixedTime: { time: '09:00', timezone: null },
            interval: null,
          },
          activeTime: { activatedAt: Date.now() },
          notificationConfig: {
            channels: ['InApp'],
            title: null,
            body: null,
            sound: null,
            vibration: null,
            actions: null,
          },
          groupId: 'foreign-group',
        }),
      ).rejects.toThrow('Invalid groupId');
    });

    it('should update group stats when groupId is provided', async () => {
      const group = ReminderGroup.load(makeGroupState());
      (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(group);

      await service.createReminderTemplate({
        identityId: IDENTITY_ID,
        title: 'Grouped',
        type: ReminderType.Recurring,
        trigger: {
          type: 'FixedTime',
          fixedTime: { time: '09:00', timezone: null },
          interval: null,
        },
        activeTime: { activatedAt: Date.now() },
        notificationConfig: {
          channels: ['InApp'],
          title: null,
          body: null,
          sound: null,
          vibration: null,
          actions: null,
        },
        groupId: group.id,
      });

      // save called for template + group stats update
      expect(groupRepo.save).toHaveBeenCalled();
    });
  });

  describe('updateGroupStats()', () => {
    it('should recalculate and persist group stats', async () => {
      const group = ReminderGroup.load(makeGroupState());
      const template = ReminderTemplate.load(
        makeTemplateState({
          groupId: group.id,
          status: ReminderStatus.Active,
          selfEnabled: true,
        }),
      );
      (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(group);
      (templateRepo.findByGroupId as ReturnType<typeof vi.fn>).mockResolvedValue([template]);

      await service.updateGroupStats(IDENTITY_ID, group.id);

      expect(groupRepo.save).toHaveBeenCalledTimes(1);
      const savedGroup = (groupRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as ReminderGroup;
      expect(savedGroup.stats.totalTemplates).toBe(1);
      expect(savedGroup.stats.activeTemplates).toBe(1);
      expect(savedGroup.stats.pausedTemplates).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // deleteTemplate()
  // -----------------------------------------------------------------------
  describe('deleteTemplate()', () => {
    it('should soft-delete and save the template', async () => {
      const template = ReminderTemplate.load(makeTemplateState());
      (templateRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(template);

      await service.deleteTemplate(IDENTITY_ID, template.id);

      expect(templateRepo.save).toHaveBeenCalledTimes(1);
      expect(template.deletedAt).not.toBeNull();
    });

    it('should throw when template not found', async () => {
      (templateRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.deleteTemplate(IDENTITY_ID, 'missing-id')).rejects.toThrow(
        'ReminderTemplate not found',
      );
    });

    it('should hard-delete via repository when specified', async () => {
      const template = ReminderTemplate.load(makeTemplateState());
      (templateRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(template);

      await service.deleteTemplate(IDENTITY_ID, template.id, false);

      expect(templateRepo.delete).toHaveBeenCalledWith(IDENTITY_ID, template.id);
    });
  });

  // -----------------------------------------------------------------------
  // createReminderGroup()
  // -----------------------------------------------------------------------
  describe('createReminderGroup()', () => {
    it('should create and save a group', async () => {
      const group = await service.createReminderGroup({
        identityId: IDENTITY_ID,
        name: 'New Group',
      });

      expect(group.name).toBe('New Group');
      expect(groupRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should throw when group name already exists', async () => {
      const existing = ReminderGroup.load(makeGroupState({ name: 'Duplicate' }));
      (groupRepo.findByName as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

      await expect(
        service.createReminderGroup({ identityId: IDENTITY_ID, name: 'Duplicate' }),
      ).rejects.toThrow('already exists');
    });
  });

  // -----------------------------------------------------------------------
  // deleteGroup()
  // -----------------------------------------------------------------------
  describe('deleteGroup()', () => {
    it('should throw when group has templates', async () => {
      const group = ReminderGroup.load(makeGroupState());
      const template = ReminderTemplate.load(makeTemplateState());
      (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(group);
      (templateRepo.findByGroupId as ReturnType<typeof vi.fn>).mockResolvedValue([template]);

      await expect(service.deleteGroup(IDENTITY_ID, group.id)).rejects.toThrow('still contains');
    });

    it('should soft-delete when no templates in group', async () => {
      const group = ReminderGroup.load(makeGroupState());
      (templateRepo.findByGroupId as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(group);

      await service.deleteGroup(IDENTITY_ID, group.id);

      expect(groupRepo.save).toHaveBeenCalled();
    });

    it('should hard-delete via repository when specified', async () => {
      const group = ReminderGroup.load(makeGroupState());
      (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(group);
      (templateRepo.findByGroupId as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await service.deleteGroup(IDENTITY_ID, group.id, false);

      expect(groupRepo.delete).toHaveBeenCalledWith(IDENTITY_ID, group.id);
    });
  });

  // -----------------------------------------------------------------------
  // assignTemplateToGroup()
  // -----------------------------------------------------------------------
  describe('assignTemplateToGroup()', () => {
    it('should move template to a new group', async () => {
      const template = ReminderTemplate.load(makeTemplateState({ groupId: null }));
      const group = ReminderGroup.load(makeGroupState());
      (templateRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(template);
      (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(group);

      const result = await service.assignTemplateToGroup(IDENTITY_ID, template.id, group.id);

      expect(result.groupId).toBe(group.id);
      expect(templateRepo.save).toHaveBeenCalled();
    });

    it('should throw when template not found', async () => {
      (templateRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.assignTemplateToGroup(IDENTITY_ID, 'missing', 'g1')).rejects.toThrow(
        'ReminderTemplate not found',
      );
    });

    it('should throw when target group is invalid', async () => {
      const template = ReminderTemplate.load(makeTemplateState());
      (templateRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(template);
      (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.assignTemplateToGroup(IDENTITY_ID, template.id, 'bad-group')).rejects.toThrow(
        'Invalid groupId',
      );
    });

    it('should allow unassigning from group (null)', async () => {
      const template = ReminderTemplate.load(makeTemplateState({ groupId: 'old-group' }));
      (templateRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(template);

      const result = await service.assignTemplateToGroup(IDENTITY_ID, template.id, null);

      expect(result.groupId).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // toggleGroupAndTemplates()
  // -----------------------------------------------------------------------
  describe('toggleGroupAndTemplates()', () => {
    it('should toggle group and save', async () => {
      const group = ReminderGroup.load(
        makeGroupState({ enabled: true }),
      );
      (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(group);

      await service.toggleGroupAndTemplates(IDENTITY_ID, group.id);

      expect(groupRepo.save).toHaveBeenCalled();
    });

    it('should recalculate member effective state when the profile gate toggles', async () => {
      const group = ReminderGroup.load(
        makeGroupState({
          enabled: true,
          status: ReminderStatus.Active,
        }),
      );
      const template = ReminderTemplate.load(makeTemplateState({ groupId: group.id }));
      (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(group);
      (templateRepo.findByGroupId as ReturnType<typeof vi.fn>).mockResolvedValue([template]);

      await service.toggleGroupAndTemplates(IDENTITY_ID, group.id);

      // Profile gate toggled -> member effective state is re-materialized
      expect(templateRepo.save).toHaveBeenCalled();
    });

    it('should throw when group not found', async () => {
      (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.toggleGroupAndTemplates(IDENTITY_ID, 'missing')).rejects.toThrow(
        'ReminderGroup not found',
      );
    });
  });
});
