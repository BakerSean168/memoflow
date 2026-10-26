import type { TransferDate } from '@memoflow/shared-primitives';
import type { NotificationChannelType } from './notification-channel-type';

/** Decision made before a delivery attempt is created. */
export const NotificationDeliveryPlanOutcome = {
  Enqueued: 'enqueued',
  Suppressed: 'suppressed',
  Deferred: 'deferred',
  RateLimited: 'rate_limited',
  Disabled: 'disabled',
  Unsupported: 'unsupported',
} as const;
export type NotificationDeliveryPlanOutcome =
  (typeof NotificationDeliveryPlanOutcome)[keyof typeof NotificationDeliveryPlanOutcome];

export const NotificationDeliveryReason = {
  WorkflowDefaultEnabled: 'workflow_default_enabled',
  WorkflowDefaultDisabled: 'workflow_default_disabled',
  UserGlobalEnabled: 'user_global_enabled',
  UserGlobalDisabled: 'user_global_disabled',
  WorkflowOverrideEnabled: 'workflow_override_enabled',
  WorkflowOverrideDisabled: 'workflow_override_disabled',
  ReadOnlyAllowlist: 'read_only_allowlist',
  UnsupportedChannel: 'unsupported_channel',
  DndActive: 'dnd_active',
  RateLimitHour: 'rate_limit_hour',
  RateLimitDay: 'rate_limit_day',
} as const;
export type NotificationDeliveryReason =
  (typeof NotificationDeliveryReason)[keyof typeof NotificationDeliveryReason];

export const NotificationPreferenceDecisionSource = {
  WorkflowDefault: 'workflow_default',
  UserGlobal: 'user_global',
  WorkflowOverride: 'workflow_override',
  ReadOnlyAllowlist: 'read_only_allowlist',
} as const;
export type NotificationPreferenceDecisionSource =
  (typeof NotificationPreferenceDecisionSource)[keyof typeof NotificationPreferenceDecisionSource];

export interface NotificationDeliveryDecisionDTO {
  channel: NotificationChannelType;
  outcome: NotificationDeliveryPlanOutcome;
  reason: NotificationDeliveryReason;
  preferenceSource?: NotificationPreferenceDecisionSource;
  retryAt?: TransferDate | null;
}

export interface NotificationDeliveryPlanDTO {
  notificationId: string;
  identityId: string;
  workflowKey: string;
  decisions: readonly NotificationDeliveryDecisionDTO[];
  createdAt: TransferDate;
}
