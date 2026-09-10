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
import { NotificationPolicy } from '../notification-policy';
import { NotificationWorkflowCatalog } from '../notification-workflow-catalog';
import { NotificationPreference } from '../../aggregates/notification-preference';
import { DoNotDisturbConfig } from '../../value-objects/do-not-disturb-config';
import { RateLimit } from '../../value-objects/rate-limit';
import { createTimeContext, type TimeContext } from '@memoflow/time';
import type { NotificationPolicyContext } from '../notification-policy';

const policy = new NotificationPolicy();
const catalog = new NotificationWorkflowCatalog();
const identityId = 'user-1' as never;
const timeContext = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const evaluate = (context: Omit<NotificationPolicyContext, 'timeContext'>) =>
  policy.evaluate({ ...context, timeContext });

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

describe('NOTIF-2402 Notification preference precedence', () => {
  it('does not let the read-only allowlist bypass rate-limit policy implicitly', () => {
    const rateLimit = RateLimit.create({ enabled: true, maxPerHour: 1, maxPerDay: 5 });
    expect(
      evaluate({
        workflow: catalog.resolve('system.account-security'),
        channel: NotificationChannelType.Desktop,
        rateLimit,
        rateLimitUsage: { hourCount: 1, dayCount: 1 },
      }),
    ).toMatchObject({
      outcome: NotificationDeliveryPlanOutcome.RateLimited,
      reason: NotificationDeliveryReason.RateLimitHour,
      preferenceSource: NotificationPreferenceDecisionSource.ReadOnlyAllowlist,
    });
  });

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
      name: 'global enable overrides disabled workflow default',
      workflowDefault: false,
      global: true,
      workflowOverride: undefined,
      outcome: NotificationDeliveryPlanOutcome.Enqueued,
      reason: NotificationDeliveryReason.UserGlobalEnabled,
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
    {
      name: 'workflow override disables after global enable',
      workflowDefault: true,
      global: true,
      workflowOverride: false,
      outcome: NotificationDeliveryPlanOutcome.Disabled,
      reason: NotificationDeliveryReason.WorkflowOverrideDisabled,
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

    expect(evaluate({ workflow, channel: NotificationChannelType.Email, preference })).toEqual({
      channel: NotificationChannelType.Email,
      outcome,
      reason,
      preferenceSource: source,
    });
  });

  it('uses an explicit read-only workflow/channel allowlist instead of a generic critical bypass', () => {
    const preference = NotificationPreference.create({ identityId });
    preference.setGlobalChannel(NotificationChannelType.Desktop, false);
    preference.setWorkflowChannelOverride(
      'system.account-security',
      NotificationChannelType.Desktop,
      false,
    );

    expect(
      evaluate({
        workflow: catalog.resolve('system.account-security'),
        channel: NotificationChannelType.Desktop,
        preference,
      }),
    ).toEqual({
      channel: NotificationChannelType.Desktop,
      outcome: NotificationDeliveryPlanOutcome.Enqueued,
      reason: NotificationDeliveryReason.ReadOnlyAllowlist,
      preferenceSource: NotificationPreferenceDecisionSource.ReadOnlyAllowlist,
    });
  });

  it('returns unsupported before user preference evaluation', () => {
    const workflow: NotificationWorkflowDefinitionDTO = {
      workflowKey: 'task.local-only',
      topic: 'task.local-only',
      channels: {},
    };
    const preference = NotificationPreference.create({ identityId });
    preference.setGlobalChannel(NotificationChannelType.Email, true);

    expect(evaluate({ workflow, channel: NotificationChannelType.Email, preference })).toEqual({
      channel: NotificationChannelType.Email,
      outcome: NotificationDeliveryPlanOutcome.Unsupported,
      reason: NotificationDeliveryReason.UnsupportedChannel,
      preferenceSource: NotificationPreferenceDecisionSource.WorkflowDefault,
    });
  });
});

describe('NOTIF-2401/2402 delivery policy outcomes', () => {
  const dnd = DoNotDisturbConfig.create({
    enabled: true,
    startTime: '22:00',
    endTime: '08:00',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  });
  const activeAt = new Date('2026-08-25T23:30:00.000Z');

  it('suppresses Desktop during DND with a stable typed reason', () => {
    expect(
      evaluate({
        workflow: catalog.resolve('system.general'),
        channel: NotificationChannelType.Desktop,
        doNotDisturb: dnd,
        now: activeAt,
      }),
    ).toMatchObject({
      outcome: NotificationDeliveryPlanOutcome.Suppressed,
      reason: NotificationDeliveryReason.DndActive,
    });
  });

  it('defers InApp during DND and carries the retry instant', () => {
    const decision = evaluate({
      workflow: catalog.resolve('system.general'),
      channel: NotificationChannelType.InApp,
      doNotDisturb: dnd,
      now: activeAt,
    });
    expect(decision).toMatchObject({
      outcome: NotificationDeliveryPlanOutcome.Deferred,
      reason: NotificationDeliveryReason.DndActive,
    });
    expect(decision.retryAt?.toISOString()).toBe(
      dnd.nextInactiveAt(activeAt, timeContext)?.toISOString(),
    );
  });

  it('bypasses DND only for the explicitly allowlisted read-only channel', () => {
    expect(
      evaluate({
        workflow: catalog.resolve('system.account-security'),
        channel: NotificationChannelType.Desktop,
        doNotDisturb: dnd,
        now: activeAt,
      }),
    ).toMatchObject({
      outcome: NotificationDeliveryPlanOutcome.Enqueued,
      reason: NotificationDeliveryReason.ReadOnlyAllowlist,
    });
  });

  it.each([
    [{ hourCount: 2, dayCount: 3 }, NotificationDeliveryReason.RateLimitHour],
    [{ hourCount: 0, dayCount: 5 }, NotificationDeliveryReason.RateLimitDay],
  ] as const)('rate-limits with deterministic reason for usage %o', (usage, reason) => {
    const rateLimit = RateLimit.create({ enabled: true, maxPerHour: 2, maxPerDay: 5 });
    expect(
      evaluate({
        workflow: catalog.resolve('system.general'),
        channel: NotificationChannelType.InApp,
        rateLimit,
        rateLimitUsage: usage,
      }),
    ).toMatchObject({ outcome: NotificationDeliveryPlanOutcome.RateLimited, reason });
  });
});
