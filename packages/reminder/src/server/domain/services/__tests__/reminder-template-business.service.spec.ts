import { describe, expect, it } from 'vitest';
import { ReminderStatus, ReminderType } from '@memoflow/contracts/reminder';
import { IdentityId } from '@memoflow/domain-shared';
import { ReminderGroup } from '../../aggregates/reminder-group';
import { ReminderTemplate } from '../../aggregates/reminder-template';
import { ReminderTemplateBusinessService } from '../reminder-template-business-service';

function createTemplate(overrides: {
  identityId?: IdentityId;
  status?: ReminderStatus;
  groupId?: string | null;
  deleted?: boolean;
} = {}) {
  const template = ReminderTemplate.create({
    identityId: overrides.identityId ?? IdentityId.generate(),
    title: 'Template',
    type: ReminderType.Recurring,
    groupId: overrides.groupId ?? undefined,
    trigger: {
      type: 'FixedTime',
      fixedTime: { time: '08:00', timezone: null },
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
  if (overrides.deleted) {
    template.softDelete();
  }

  return template;
}

function createGroup(identityId: string, overrides: { status?: ReminderStatus } = {}) {
  const group = ReminderGroup.create({
    identityId,
    name: 'Group',
  });

  if (overrides.status === ReminderStatus.Paused) {
    group.pause();
  }

  return group;
}

describe('ReminderTemplateBusinessService', () => {
  const service = new ReminderTemplateBusinessService();

  it('respects the global reminder switch before group logic', () => {
    const template = createTemplate();
    const result = service.calculateEffectiveEnabled(template, null, false);

    expect(result.isEffectivelyEnabled).toBe(false);
    expect(result.reason).toContain('legacy seam -> Routine gate');
  });

  it('uses Routine and Profile gates for effective state', () => {
    const identityId = IdentityId.generate();
    const group = createGroup(String(identityId), {
      status: ReminderStatus.Paused,
    });

    expect(service.calculateEffectiveEnabled(createTemplate({ identityId }), null).isEffectivelyEnabled).toBe(
      true,
    );
    expect(
      service.calculateEffectiveEnabled(
        createTemplate({ identityId, status: ReminderStatus.Paused, groupId: group.id }),
        group,
      ).isEffectivelyEnabled,
    ).toBe(false);
  });

  it('uses the same Routine × Profile formula for all profile states', () => {
    const identityId = IdentityId.generate();
    const pausedGroup = createGroup(String(identityId), {
      status: ReminderStatus.Paused,
    });
    const activeGroup = createGroup(String(identityId), {
      status: ReminderStatus.Active,
    });

    const paused = service.calculateEffectiveEnabled(
      createTemplate({ identityId, groupId: pausedGroup.id }),
      pausedGroup,
    );
    const active = service.calculateEffectiveEnabled(
      createTemplate({
        identityId,
        groupId: activeGroup.id,
        status: ReminderStatus.Paused,
      }),
      activeGroup,
    );

    expect(paused.isEffectivelyEnabled).toBe(false);
    expect(paused.reason).toContain('Profile 已关闭或未激活');
    expect(active.isEffectivelyEnabled).toBe(false);
    expect(active.reason).toContain('Profile 开启不能重新启用');
  });

  it('calculates batch status using the provided group map', () => {
    const identityId = IdentityId.generate();
    const group = createGroup(String(identityId));
    const template = createTemplate({ identityId, groupId: group.id });
    const standalone = createTemplate({ identityId });

    const result = service.calculateEffectiveEnabledBatch(
      [template, standalone],
      new Map([[group.id, group]]),
    );

    expect(result.get(template.id)?.groupStatus).toBe(ReminderStatus.Active);
    expect(result.get(standalone.id)?.groupStatus).toBeNull();
  });

  it('validates group assignment and deletion semantics', () => {
    const identityId = IdentityId.generate();
    const template = createTemplate({ identityId });
    const foreignGroup = createGroup(String(IdentityId.generate()));

    expect(service.validateGroupAssignment(template, null)).toEqual({ valid: true });
    expect(service.validateGroupAssignment(template, foreignGroup)).toEqual(
      expect.objectContaining({ valid: false }),
    );
    expect(service.validateTemplateDeletion(createTemplate({ deleted: true }), false)).toEqual({
      valid: false,
      reason: '模板已被软删除，无法再次软删除',
    });
    expect(service.validateTemplateDeletion(template, true)).toEqual({ valid: true });
  });
});
