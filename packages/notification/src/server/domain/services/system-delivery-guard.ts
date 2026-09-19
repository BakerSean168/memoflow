import {
  NotificationDeliveryPlanOutcome,
  NotificationDeliveryReason,
  type NotificationChannelType,
} from '@memoflow/contracts/notification';
import type { NotificationDeliveryUsage } from '../repositories/i-notification-repository';

export interface SystemDeliveryGuardLimits {
  readonly maxPerHour: number;
  readonly maxPerDay: number;
}

export interface SystemDeliveryGuardDecision {
  readonly outcome: typeof NotificationDeliveryPlanOutcome.RateLimited;
  readonly reason:
    | typeof NotificationDeliveryReason.RateLimitHour
    | typeof NotificationDeliveryReason.RateLimitDay;
}

export interface SystemDeliveryGuardPort {
  evaluate(input: {
    readonly workflowKey: string;
    readonly channel: NotificationChannelType;
    readonly usage: NotificationDeliveryUsage;
  }): SystemDeliveryGuardDecision | null;
}

/** Platform safety guard. This is not user-editable notification preference state. */
export class SystemDeliveryGuard implements SystemDeliveryGuardPort {
  constructor(
    private readonly resolveLimits: (
      workflowKey: string,
      channel: NotificationChannelType,
    ) => SystemDeliveryGuardLimits = () => ({ maxPerHour: 100, maxPerDay: 1000 }),
  ) {}

  evaluate(input: {
    readonly workflowKey: string;
    readonly channel: NotificationChannelType;
    readonly usage: NotificationDeliveryUsage;
  }): SystemDeliveryGuardDecision | null {
    const limits = this.resolveLimits(input.workflowKey, input.channel);
    if (!Number.isInteger(limits.maxPerHour) || limits.maxPerHour <= 0) {
      throw new TypeError('SystemDeliveryGuard maxPerHour must be a positive integer');
    }
    if (!Number.isInteger(limits.maxPerDay) || limits.maxPerDay < limits.maxPerHour) {
      throw new TypeError('SystemDeliveryGuard maxPerDay must be an integer >= maxPerHour');
    }
    if (input.usage.hourCount >= limits.maxPerHour) {
      return {
        outcome: NotificationDeliveryPlanOutcome.RateLimited,
        reason: NotificationDeliveryReason.RateLimitHour,
      };
    }
    if (input.usage.dayCount >= limits.maxPerDay) {
      return {
        outcome: NotificationDeliveryPlanOutcome.RateLimited,
        reason: NotificationDeliveryReason.RateLimitDay,
      };
    }
    return null;
  }
}
