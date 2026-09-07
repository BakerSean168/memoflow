import { describe, expect, it } from 'vitest';
import { ReminderStatus, ReminderType } from '@memoflow/contracts/reminder';
import { IdentityId } from '@memoflow/domain-shared';
import { ReminderGroup } from '../../aggregates/reminder-group';
import { ReminderTemplate } from '../../aggregates/reminder-template';
import { ReminderGroupBusinessService } from '../reminder-group-business-service';

function createTemplate(overrides: {
  identityId?: IdentityId;
  status?: ReminderStatus;
  deleted?: boolean;
} = {}) {
  const template = ReminderTemplate.create({
    identityId: overrides.identityId ?? IdentityId.generate(),
    title: 'Template',
    type: ReminderType.Recurring,
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

function createGroup(identityId: string, overrides: { deleted?: boolean } = {}) {
  const group = ReminderGroup.create({
    identityId,
    name: 'Group',
  });

  if (overrides.deleted) {
    group.softDelete();
  }

  return group;
}

describe('ReminderGroupBusinessService', () => {
  const service = new ReminderGroupBusinessService();

  it('calculates group statistics with and without deleted templates', () => {
    const templates = [
      createTemplate(),
      createTemplate({ status: ReminderStatus.Paused }),
      createTemplate({ deleted: true }),
    ];

    expect(service.calculateGroupStatistics(templates)).toEqual({
      totalTemplates: 2,
      activeTemplates: 1,
      pausedTemplates: 1,
      deletedTemplates: 1,
    });
    expect(service.calculateGroupStatistics(templates, true)).toEqual({
      totalTemplates: 3,
      activeTemplates: 2,
      pausedTemplates: 1,
      deletedTemplates: 1,
    });
  });

  it('validates deletion based on active templates and soft-delete state', () => {
    const group = createGroup(String(IdentityId.generate()));
    const deletedGroup = createGroup(String(IdentityId.generate()), { deleted: true });

    expect(service.validateGroupDeletion(group, [createTemplate()], false)).toEqual(
      expect.objectContaining({ valid: false, affectedTemplateCount: 1 }),
    );
    expect(service.validateGroupDeletion(deletedGroup, [], false)).toEqual({
      valid: false,
      reason: '分组已被软删除，无法再次软删除',
      affectedTemplateCount: 0,
    });
    expect(service.validateGroupDeletion(group, [], true)).toEqual({
      valid: true,
      affectedTemplateCount: 0,
    });
  });

  it('validates name uniqueness while ignoring deleted or excluded groups', () => {
    const identityId = String(IdentityId.generate());
    const active = createGroup(identityId);
    const deleted = createGroup(identityId, { deleted: true });
    const other = createGroup(String(IdentityId.generate()));

    expect(
      service.validateGroupNameUniqueness(identityId, active.name, [active, deleted, other]),
    ).toEqual(expect.objectContaining({ valid: false, conflictingGroup: active }));
    expect(
      service.validateGroupNameUniqueness(identityId, active.name, [active], active.id),
    ).toEqual({ valid: true });
  });

  it('applies Profile status impact to non-deleted members', () => {
    const identityId = String(IdentityId.generate());
    const active = createTemplate();
    const deleted = createTemplate({ deleted: true });

    expect(
      service.calculateGroupStatusChangeImpact(
        createGroup(identityId),
        [active, deleted],
      ),
    ).toEqual([active]);
    expect(
      service.calculateGroupStatusChangeImpact(
        createGroup(identityId),
        [active, deleted],
      ),
    ).toEqual([active]);
  });
});
