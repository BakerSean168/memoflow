import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReminderStatus, ReminderType } from '@memoflow/contracts/reminder';
import { IdentityId } from '@memoflow/domain-shared';
import { ReminderGroup } from '../../aggregates/reminder-group';
import { ReminderTemplate } from '../../aggregates/reminder-template';
import { ReminderTemplateControlService } from '../reminder-template-control-service';

function createTemplate(overrides: {
  identityId?: IdentityId;
  groupId?: string | null;
  status?: ReminderStatus;
} = {}) {
  const template = ReminderTemplate.create({
    identityId: overrides.identityId ?? IdentityId.generate(),
    title: 'Template',
    type: ReminderType.Recurring,
    groupId: overrides.groupId ?? undefined,
    trigger: {
      type: 'FixedTime',
      fixedTime: { time: '09:00', timezone: null },
      interval: null,
    },
    activeTime: { activatedAt: Date.now() - 60_000 },
    notificationConfig: {
      channels: ['InApp'],
      title: null,
      body: null,
      sound: null,
      vibration: null,
      actions: null,
    },
  });

  if (overrides.status === ReminderStatus.Paused) {
    template.pause();
  }

  return template;
}

function createGroup(identityId: string, overrides: {
  status?: ReminderStatus;
} = {}) {
  const group = ReminderGroup.create({
    identityId,
    name: 'Group',
  });

  if (overrides.status === ReminderStatus.Paused) {
    group.pause();
  }

  return group;
}

describe('ReminderTemplateControlService -> Routine effectiveEnabled seam', () => {
  const templateRepository = {
    findByGroupId: vi.fn(),
    findByIdentityId: vi.fn(),
  } as any;
  const groupRepository = {
    findByIdForIdentity: vi.fn(),
    findByIds: vi.fn(),
  } as any;
  const preferenceRepository = {
    findByIdentityId: vi.fn(),
  } as any;

  let service: ReminderTemplateControlService;

  beforeEach(() => {
    vi.clearAllMocks();
    preferenceRepository.findByIdentityId.mockResolvedValue(null);
    groupRepository.findByIdForIdentity.mockResolvedValue(null);
    groupRepository.findByIds.mockResolvedValue([]);
    service = new ReminderTemplateControlService(
      templateRepository,
      groupRepository,
      preferenceRepository,
    );
  });

  it('folds the legacy identity-wide switch into the Routine gate', async () => {
    const template = createTemplate();
    preferenceRepository.findByIdentityId.mockResolvedValue({ globalReminderEnabled: false });

    const result = await service.calculateEffectiveStatus(template);

    expect(result.effectiveStatus).toBe(ReminderStatus.Paused);
    expect(result.isEffectivelyEnabled).toBe(false);
    expect(result.lifecycleSource).toBe('global');
  });

  it('uses Routine state for an unprofiled legacy template', async () => {
    const active = await service.calculateEffectiveStatus(createTemplate());
    const paused = await service.calculateEffectiveStatus(
      createTemplate({ status: ReminderStatus.Paused }),
    );

    expect(active.effectiveStatus).toBe(ReminderStatus.Active);
    expect(active.statusReason).toContain('Routine 自身 enabled');
    expect(paused.effectiveStatus).toBe(ReminderStatus.Paused);
  });

  it('falls back to unprofiled Routine truth when the referenced legacy group is missing', async () => {
    const template = createTemplate({ groupId: 'missing-group' });

    const result = await service.calculateEffectiveStatus(template);

    expect(groupRepository.findByIdForIdentity).toHaveBeenCalled();
    expect(result.lifecycleSource).toBe('template');
    expect(result.statusReason).toContain('分组不存在');
  });

  it('profile off disables execution without changing the Routine member state', async () => {
    const identityId = IdentityId.generate();
    const group = createGroup(String(identityId), {
      status: ReminderStatus.Paused,
    });
    const template = createTemplate({ identityId, groupId: group.id });

    const result = await service.calculateEffectiveStatus(template, group);

    expect(template.status).toBe(ReminderStatus.Active);
    expect(result.effectiveStatus).toBe(ReminderStatus.Paused);
    expect(result.lifecycleSource).toBe('group');
    expect(result.groupEnabled).toBe(false);
  });

  it('profile on never revives a disabled Routine', async () => {
    const identityId = IdentityId.generate();
    const group = createGroup(String(identityId), { status: ReminderStatus.Active });

    const result = await service.calculateEffectiveStatus(
      createTemplate({ identityId, groupId: group.id, status: ReminderStatus.Paused }),
      group,
    );

    expect(result.isEffectivelyEnabled).toBe(false);
    expect(result.statusReason).toContain('Profile 开启不能重新启用');
  });

  it('calculates batch state with the same formula and filters enabled templates', async () => {
    const identityId = IdentityId.generate();
    const group = createGroup(String(identityId), {
      status: ReminderStatus.Active,
    });
    const enabled = createTemplate({ identityId, groupId: group.id });
    const paused = createTemplate({
      identityId,
      groupId: group.id,
      status: ReminderStatus.Paused,
    });
    const ungrouped = createTemplate({ identityId });

    groupRepository.findByIdForIdentity.mockResolvedValue(group);
    groupRepository.findByIds.mockResolvedValue([group]);
    templateRepository.findByGroupId.mockResolvedValue([enabled, paused]);
    templateRepository.findByIdentityId.mockResolvedValue([enabled, paused, ungrouped]);

    const batch = await service.calculateEffectiveStatusBatch([enabled, paused, ungrouped]);
    const inGroup = await service.getEffectivelyEnabledTemplatesInGroup(String(group.identityId), group.id);
    const byIdentity = await service.getEffectivelyEnabledTemplatesByIdentityId(String(identityId));

    expect(batch).toHaveLength(3);
    expect(batch.find((item) => item.templateId === enabled.id)?.isEffectivelyEnabled).toBe(true);
    expect(batch.find((item) => item.templateId === paused.id)?.isEffectivelyEnabled).toBe(false);
    expect(await service.isTemplateEffectivelyEnabled(enabled)).toBe(true);
    expect(inGroup.map((item) => item.id)).toEqual([enabled.id]);
    expect(byIdentity.map((item) => item.id)).toEqual([enabled.id, ungrouped.id]);
  });
});
