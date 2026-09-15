import {
  NotificationDeliveryPlanOutcome,
  NotificationDeliveryReason,
  NotificationDndBehavior,
  NotificationPreferenceControl,
  NotificationPreferenceDecisionSource,
  type NotificationChannelType,
  type NotificationDeliveryPlanOutcome as DeliveryPlanOutcome,
  type NotificationDeliveryReason as DeliveryReason,
  type NotificationPreferenceDecisionSource as PreferenceDecisionSource,
  type NotificationWorkflowDefinitionDTO,
} from '@memoflow/contracts/notification';
import { BusinessRuleViolationError } from '@memoflow/utils/errors';
import type { NotificationPreference } from '../aggregates/notification-preference';
import type { DoNotDisturbConfig } from '../value-objects/do-not-disturb-config';
import type { RateLimit } from '../value-objects/rate-limit';
import type { TimeContext } from '@memoflow/time';

export interface NotificationDeliveryDecision {
  channel: NotificationChannelType;
  outcome: DeliveryPlanOutcome;
  reason: DeliveryReason;
  preferenceSource?: PreferenceDecisionSource;
  retryAt?: Date;
}

export interface NotificationPolicyContext {
  workflow: NotificationWorkflowDefinitionDTO;
  channel: NotificationChannelType;
  preference?: NotificationPreference | null;
  doNotDisturb?: DoNotDisturbConfig | null;
  rateLimit?: RateLimit | null;
  rateLimitUsage?: { hourCount: number; dayCount: number };
  now?: Date;
  timeContext: TimeContext;
}

export class NotificationPolicy {
  evaluate(context: NotificationPolicyContext): NotificationDeliveryDecision {
    const capability = context.workflow.channels[context.channel];
    if (!capability?.supported) {
      return {
        channel: context.channel,
        outcome: NotificationDeliveryPlanOutcome.Unsupported,
        reason: NotificationDeliveryReason.UnsupportedChannel,
        preferenceSource: NotificationPreferenceDecisionSource.WorkflowDefault,
      };
    }

    let enabled = capability.enabledByDefault;
    let source: PreferenceDecisionSource = NotificationPreferenceDecisionSource.WorkflowDefault;
    let enabledReason: DeliveryReason = enabled
      ? NotificationDeliveryReason.WorkflowDefaultEnabled
      : NotificationDeliveryReason.WorkflowDefaultDisabled;

    if (capability.preferenceControl === NotificationPreferenceControl.ReadOnly) {
      enabled = true;
      source = NotificationPreferenceDecisionSource.ReadOnlyAllowlist;
      enabledReason = NotificationDeliveryReason.ReadOnlyAllowlist;
    } else {
      const global = context.preference?.getGlobalChannel(context.channel);
      if (global !== undefined) {
        enabled = global;
        source = NotificationPreferenceDecisionSource.UserGlobal;
        enabledReason = global
          ? NotificationDeliveryReason.UserGlobalEnabled
          : NotificationDeliveryReason.UserGlobalDisabled;
      }

      const workflowOverride = context.preference?.getWorkflowChannelOverride(
        context.workflow.workflowKey,
        context.channel,
      );
      if (workflowOverride !== undefined) {
        enabled = workflowOverride;
        source = NotificationPreferenceDecisionSource.WorkflowOverride;
        enabledReason = workflowOverride
          ? NotificationDeliveryReason.WorkflowOverrideEnabled
          : NotificationDeliveryReason.WorkflowOverrideDisabled;
      }
    }

    if (!enabled) {
      return {
        channel: context.channel,
        outcome: NotificationDeliveryPlanOutcome.Disabled,
        reason: enabledReason,
        preferenceSource: source,
      };
    }

    const now = context.now ?? new Date();
    if (
      context.doNotDisturb?.isActiveAt(now, context.timeContext)
      && capability.dndBehavior !== NotificationDndBehavior.Bypass
    ) {
      if (capability.dndBehavior === NotificationDndBehavior.Suppress) {
        return {
          channel: context.channel,
          outcome: NotificationDeliveryPlanOutcome.Suppressed,
          reason: NotificationDeliveryReason.DndActive,
          preferenceSource: source,
        };
      }
      const retryAt = context.doNotDisturb.nextInactiveAt(now, context.timeContext);
      return {
        channel: context.channel,
        outcome: NotificationDeliveryPlanOutcome.Deferred,
        reason: NotificationDeliveryReason.DndActive,
        preferenceSource: source,
        ...(retryAt ? { retryAt } : {}),
      };
    }

    if (context.rateLimit?.enabled && context.rateLimitUsage) {
      if (context.rateLimitUsage.hourCount >= context.rateLimit.maxPerHour) {
        return {
          channel: context.channel,
          outcome: NotificationDeliveryPlanOutcome.RateLimited,
          reason: NotificationDeliveryReason.RateLimitHour,
          preferenceSource: source,
        };
      }
      if (context.rateLimitUsage.dayCount >= context.rateLimit.maxPerDay) {
        return {
          channel: context.channel,
          outcome: NotificationDeliveryPlanOutcome.RateLimited,
          reason: NotificationDeliveryReason.RateLimitDay,
          preferenceSource: source,
        };
      }
    }

    return {
      channel: context.channel,
      outcome: NotificationDeliveryPlanOutcome.Enqueued,
      reason: enabledReason,
      preferenceSource: source,
    };
  }

  assertCanSend(context: NotificationPolicyContext): void {
    const decision = this.evaluate(context);
    if (
      decision.outcome === NotificationDeliveryPlanOutcome.Enqueued
      || decision.outcome === NotificationDeliveryPlanOutcome.Deferred
    ) {
      return;
    }
    throw new BusinessRuleViolationError(
      `Notification delivery blocked: ${decision.outcome}/${decision.reason}`,
    );
  }
}
