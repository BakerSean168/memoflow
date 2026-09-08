import { describe, expect, it, vi } from 'vitest';
import { ReminderStatus, ReminderType } from '@memoflow/contracts/reminder';
import { buildSchedulingKey } from '@memoflow/contracts/schedule';
import {
  REMINDER_SCHEDULING_OWNER_TYPE,
  REMINDER_TEMPLATE_HANDLER_KEY,
  REMINDER_TEMPLATE_PAYLOAD_VERSION,
  createReminderScheduleProjectionEventHandlers,
  createReminderScheduleProjectionSource,
} from './schedule-projection-source';

function makeRoutineProfileStore(input?: { profileActive?: boolean }) {
  if (input?.profileActive === undefined) {
    return {
      listMembershipsForRoutines: vi.fn().mockResolvedValue([]),
      findProfilesByIds: vi.fn().mockResolvedValue([]),
    } as never;
  }

  return {
    listMembershipsForRoutines: vi.fn().mockResolvedValue([
      {
        identityId: 'IdentityId_reminder-owner',
        profileId: 'IRoutineProfileId_work',
        routineId: 'ReminderTemplateId_template-1',
        enabled: true,
      },
    ]),
    findProfilesByIds: vi.fn().mockResolvedValue([
      {
        id: 'IRoutineProfileId_work',
        identityId: 'IdentityId_reminder-owner',
        name: 'Work',
        enabled: true,
        active: input.profileActive,
      },
    ]),
  } as never;
}

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ReminderTemplateId_template-1',
    identityId: 'IdentityId_reminder-owner',
    title: 'Pay rent',
    description: 'Monthly rent reminder',
    type: ReminderType.OneTime,
    selfEnabled: true,
    status: ReminderStatus.Active,
    deletedAt: null,
    nextTriggerAt: Date.parse('2030-01-15T08:00:00.000Z'),
    version: 7,
    ...overrides,
  };
}

describe('createReminderScheduleProjectionSource', () => {
  it('projects enabled unprofiled Routine truth into one neutral ScheduledIntent', async () => {
    const template = makeTemplate();
    const findByIdForIdentity = vi.fn().mockResolvedValue(template);
    const source = createReminderScheduleProjectionSource({
      reminderTemplateRepository: {
        findByIdForIdentity,
        findAllTemplateRefs: vi.fn().mockResolvedValue([]),
      } as never,
      routineProfileStore: makeRoutineProfileStore(),
    });

    const plan = await source.buildTemplatePlan(template.id, template.identityId);

    expect(findByIdForIdentity).toHaveBeenCalledWith(template.identityId, template.id);
    expect(plan.owner).toEqual({
      identityId: template.identityId,
      type: REMINDER_SCHEDULING_OWNER_TYPE,
      id: template.id,
    });
    expect(plan.desired).toEqual([
      expect.objectContaining({
        schedulingKey: buildSchedulingKey(
          'reminder.template',
          template.id,
          String(template.nextTriggerAt),
        ),
        handlerKey: REMINDER_TEMPLATE_HANDLER_KEY,
        runAt: template.nextTriggerAt,
        payloadVersion: REMINDER_TEMPLATE_PAYLOAD_VERSION,
        payload: { templateId: template.id, scheduledFor: template.nextTriggerAt },
        sourceRevision: 7,
      }),
    ]);
    expect(JSON.stringify(plan)).not.toContain('sourceModule');
  });

  it('does not schedule a Routine when every canonical ProfileMembership path is gated off', async () => {
    const template = makeTemplate();
    const source = createReminderScheduleProjectionSource({
      reminderTemplateRepository: {
        findByIdForIdentity: vi.fn().mockResolvedValue(template),
        findAllTemplateRefs: vi.fn().mockResolvedValue([]),
      } as never,
      routineProfileStore: makeRoutineProfileStore({ profileActive: false }),
    });

    await expect(source.buildTemplatePlan(template.id, template.identityId)).resolves.toEqual({
      owner: {
        identityId: template.identityId,
        type: REMINDER_SCHEDULING_OWNER_TYPE,
        id: template.id,
      },
      desired: [],
    });
  });

  it('returns an empty desired set for a missing template', async () => {
    const findByIdForIdentity = vi.fn().mockResolvedValue(null);
    const source = createReminderScheduleProjectionSource({
      reminderTemplateRepository: {
        findByIdForIdentity,
        findAllTemplateRefs: vi.fn().mockResolvedValue([]),
      } as never,
      routineProfileStore: makeRoutineProfileStore(),
    });

    await expect(
      source.buildTemplatePlan('ReminderTemplateId_missing', 'IdentityId_reminder-owner'),
    ).resolves.toEqual({
      owner: {
        identityId: 'IdentityId_reminder-owner',
        type: REMINDER_SCHEDULING_OWNER_TYPE,
        id: 'ReminderTemplateId_missing',
      },
      desired: [],
    });
  });

  it('enumerates durable authority refs for startup lost-event repair', async () => {
    const findAllTemplateRefs = vi.fn().mockResolvedValue([
      { id: 'ReminderTemplateId_a', identityId: 'IdentityId_1' },
      { id: 'ReminderTemplateId_b', identityId: 'IdentityId_2' },
    ]);
    const source = createReminderScheduleProjectionSource({
      reminderTemplateRepository: {
        findByIdForIdentity: vi.fn(),
        findAllTemplateRefs,
      } as never,
      routineProfileStore: makeRoutineProfileStore(),
    });
    await expect(source.listTemplateRefs()).resolves.toEqual([
      { templateId: 'ReminderTemplateId_a', identityId: 'IdentityId_1' },
      { templateId: 'ReminderTemplateId_b', identityId: 'IdentityId_2' },
    ]);
  });

  it('reprojects immediately when canonical eligibility context changes', async () => {
    const upsertTemplate = vi.fn().mockResolvedValue(undefined);
    const handlers = createReminderScheduleProjectionEventHandlers({
      upsertTemplate,
      deleteTemplate: vi.fn().mockResolvedValue(undefined),
    });

    await handlers['reminder:template-eligibility-changed']({
      identityId: 'IdentityId_reminder-owner' as never,
      templateId: 'ReminderTemplateId_template-1' as never,
      cause: 'profile-gate',
    });

    expect(upsertTemplate).toHaveBeenCalledWith(
      'ReminderTemplateId_template-1',
      'IdentityId_reminder-owner',
    );
  });

  it('re-arms recurring reminders only after the persisted reminder:triggered event', async () => {
    const upsertTemplate = vi.fn().mockResolvedValue(undefined);
    const deleteTemplate = vi.fn().mockResolvedValue(undefined);
    const handlers = createReminderScheduleProjectionEventHandlers({
      upsertTemplate,
      deleteTemplate,
    });

    await handlers['reminder:triggered']({
      identityId: 'IdentityId_reminder-owner' as never,
      templateId: 'ReminderTemplateId_template-1' as never,
      triggeredAt: 1,
      nextTriggerAt: 2,
      reminder: {} as never,
    });

    expect(upsertTemplate).toHaveBeenCalledWith(
      'ReminderTemplateId_template-1',
      'IdentityId_reminder-owner',
    );
    expect(deleteTemplate).not.toHaveBeenCalled();
  });
});
