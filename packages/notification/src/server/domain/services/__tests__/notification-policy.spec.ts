import { describe, expect, it } from 'vitest';
import {
  NotificationChannelType,
  NotificationDeliveryPlanOutcome,
  NotificationDeliveryReason,
  NotificationDndBehavior,
  NotificationPreferenceControl,
  NotificationPreferenceDecisionSource,
  type NotificationWorkflowDefinitionDTO,
} from '@memoflow/contracts/notification';
import { asHm, requireTimeZoneId } from '@memoflow/time';
import { NotificationPolicy } from '../notification-policy';
import { NotificationWorkflowCatalog } from '../notification-workflow-catalog';
import { SystemDeliveryGuard } from '../system-delivery-guard';
import { NotificationPreference } from '../../aggregates/notification-preference';
import { QuietHours } from '../../value-objects/quiet-hours';

const policy = new NotificationPolicy();
const catalog = new NotificationWorkflowCatalog();
const identityId = 'user-1' as never;

function configurableWorkflow(enabledByDefault: boolean): NotificationWorkflowDefinitionDTO {
  return {
    workflowKey: 'task.deadline',
    topic: 'task.deadline',
    channels: {
      [NotificationChannelType.Email]: {
        supported: true,
        enabledByDefault,
        preferenceControl: NotificationPreferenceControl.UserConfigurable,
        dndBehavior: NotificationDndBehavior.Defer,
      },
    },
  };
}

function everyNight(): QuietHours {
  return QuietHours.create({
    enabled: true,
    timeZone: requireTimeZoneId('UTC'),
    weeklyWindows: [{
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      start: asHm('22:00'),
      end: asHm('08:00'),
    }],
  });
}

describe('Notification user/workflow policy', () => {
  it.each([
    {
      name: 'workflow default disabled',
      workflowDefault: false,
      global: undefined,
      workflowOverride: undefined,
      outcome: NotificationDeliveryPlanOutcome.Disabled,
      reason: NotificationDeliveryReason.WorkflowDefaultDisabled,
      source: NotificationPreferenceDecisionSource.WorkflowDefault,
    },
    {
      name: 'global disable overrides enabled workflow default',
      workflowDefault: true,
      global: false,
      workflowOverride: undefined,
      outcome: NotificationDeliveryPlanOutcome.Disabled,
      reason: NotificationDeliveryReason.UserGlobalDisabled,
      source: NotificationPreferenceDecisionSource.UserGlobal,
    },
    {
      name: 'workflow override enables after global disable',
      workflowDefault: true,
      global: false,
      workflowOverride: true,
      outcome: NotificationDeliveryPlanOutcome.Enqueued,
      reason: NotificationDeliveryReason.WorkflowOverrideEnabled,
      source: NotificationPreferenceDecisionSource.WorkflowOverride,
    },
  ])('$name', ({ workflowDefault, global, workflowOverride, outcome, reason, source }) => {
    const workflow = configurableWorkflow(workflowDefault);
    const preference = NotificationPreference.create({ identityId });
    if (global !== undefined) preference.setGlobalChannel(NotificationChannelType.Email, global);
    if (workflowOverride !== undefined) {
      preference.setWorkflowChannelOverride(
        workflow.workflowKey,
        NotificationChannelType.Email,
        workflowOverride,
      );
    }

    expect(policy.evaluate({ workflow, channel: NotificationChannelType.Email, preference })).toEqual({
      channel: NotificationChannelType.Email,
      outcome,
      reason,
      preferenceSource: source,
    });
  });

  it('keeps the explicit read-only allowlist authoritative over user channel choices', () => {
    const preference = NotificationPreference.create({ identityId });
    preference.setGlobalChannel(NotificationChannelType.Desktop, false);
    preference.setWorkflowChannelOverride('system.account-security', NotificationChannelType.Desktop, false);

    expect(policy.evaluate({
      workflow: catalog.resolve('system.account-security'),
      channel: NotificationChannelType.Desktop,
      preference,
    })).toEqual({
      channel: NotificationChannelType.Desktop,
      outcome: NotificationDeliveryPlanOutcome.Enqueued,
      reason: NotificationDeliveryReason.ReadOnlyAllowlist,
      preferenceSource: NotificationPreferenceDecisionSource.ReadOnlyAllowlist,
    });
  });

  it('returns unsupported before user preference evaluation', () => {
    const preference = NotificationPreference.create({ identityId });
    preference.setGlobalChannel(NotificationChannelType.Email, true);
    expect(policy.evaluate({
      workflow: { workflowKey: 'task.local-only', topic: 'task.local-only', channels: {} },
      channel: NotificationChannelType.Email,
      preference,
    })).toMatchObject({
      outcome: NotificationDeliveryPlanOutcome.Unsupported,
      reason: NotificationDeliveryReason.UnsupportedChannel,
    });
  });
});

describe('NotificationWorkflowCatalog boundaries', () => {
  it('registers trimmed custom workflows, resolves unknown workflows fail-safe, and lists deterministically', () => {
    const customCatalog = new NotificationWorkflowCatalog();
    const base = customCatalog.resolve('system.general');
    customCatalog.register({
      ...base,
      workflowKey: '  custom.workflow  ',
      topicKey: 'custom.topic',
    });

    expect(customCatalog.has('custom.workflow')).toBe(true);
    expect(customCatalog.resolve('custom.workflow').workflowKey).toBe('custom.workflow');
    expect(customCatalog.list().map((item) => item.workflowKey)).toEqual(
      [...customCatalog.list().map((item) => item.workflowKey)].sort(),
    );

    const unknown = customCatalog.resolve('unregistered.workflow', '  custom.unknown.topic  ');
    expect(unknown.workflowKey).toBe('unregistered.workflow');
    expect(unknown.topicKey).toBe('custom.unknown.topic');
    expect(Object.keys(unknown.channels)).toEqual([NotificationChannelType.InApp]);
  });

  it('rejects malformed workflow registrations and blank resolution keys', () => {
    const customCatalog = new NotificationWorkflowCatalog();
    const base = customCatalog.resolve('system.general');

    expect(() => customCatalog.register({ ...base, workflowKey: ' ' })).toThrow('workflowKey is required');
    expect(() => customCatalog.register({
      ...base,
      workflowKey: 'missing.presentation',
      presentationDefaults: null as never,
    })).toThrow('workflow presentationDefaults are required');
    expect(() => customCatalog.register({
      ...base,
      workflowKey: 'missing.legacy',
      legacyProjection: null as never,
    })).toThrow('workflow legacyProjection is required');
    expect(() => customCatalog.resolve(' ')).toThrow('workflowKey is required');
  });
});

describe('QuietHours and SystemDeliveryGuard boundaries', () => {
  const activeAt = new Date('2026-08-25T23:30:00.000Z');

  it('suppresses Desktop and defers InApp during QuietHours', () => {
    const quietHours = everyNight();
    expect(policy.evaluate({
      workflow: catalog.resolve('system.general'),
      channel: NotificationChannelType.Desktop,
      quietHours,
      now: activeAt,
    })).toMatchObject({
      outcome: NotificationDeliveryPlanOutcome.Suppressed,
      reason: NotificationDeliveryReason.DndActive,
    });

    const deferred = policy.evaluate({
      workflow: catalog.resolve('system.general'),
      channel: NotificationChannelType.InApp,
      quietHours,
      now: activeAt,
    });
    expect(deferred).toMatchObject({
      outcome: NotificationDeliveryPlanOutcome.Deferred,
      reason: NotificationDeliveryReason.DndActive,
    });
    expect(deferred.retryAt?.toISOString()).toBe('2026-08-26T08:00:00.000Z');
  });

  it('bypasses QuietHours only for the explicitly allowlisted channel', () => {
    expect(policy.evaluate({
      workflow: catalog.resolve('system.account-security'),
      channel: NotificationChannelType.Desktop,
      quietHours: everyNight(),
      now: activeAt,
    })).toMatchObject({
      outcome: NotificationDeliveryPlanOutcome.Enqueued,
      reason: NotificationDeliveryReason.ReadOnlyAllowlist,
    });
  });

  it.each([
    [{ hourCount: 2, dayCount: 3 }, NotificationDeliveryReason.RateLimitHour],
    [{ hourCount: 0, dayCount: 5 }, NotificationDeliveryReason.RateLimitDay],
  ] as const)('applies platform limits outside NotificationPreference for usage %o', (usage, reason) => {
    const guard = new SystemDeliveryGuard(() => ({ maxPerHour: 2, maxPerDay: 5 }));
    expect(guard.evaluate({
      workflowKey: 'system.general',
      channel: NotificationChannelType.InApp,
      usage,
    })).toEqual({ outcome: NotificationDeliveryPlanOutcome.RateLimited, reason });
  });

  it('allows usage below limits and validates platform guard configuration', () => {
    const guard = new SystemDeliveryGuard(() => ({ maxPerHour: 2, maxPerDay: 5 }));
    expect(guard.evaluate({
      workflowKey: 'system.general',
      channel: NotificationChannelType.InApp,
      usage: { hourCount: 1, dayCount: 4 },
    })).toBeNull();

    expect(() => new SystemDeliveryGuard(() => ({ maxPerHour: 0, maxPerDay: 5 })).evaluate({
      workflowKey: 'system.general',
      channel: NotificationChannelType.InApp,
      usage: { hourCount: 0, dayCount: 0 },
    })).toThrow('maxPerHour must be a positive integer');

    expect(() => new SystemDeliveryGuard(() => ({ maxPerHour: 5, maxPerDay: 4 })).evaluate({
      workflowKey: 'system.general',
      channel: NotificationChannelType.InApp,
      usage: { hourCount: 0, dayCount: 0 },
    })).toThrow('maxPerDay must be an integer >= maxPerHour');
  });
});
