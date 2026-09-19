/**
 * Notification Value Objects
 * 通知值对象导出
 */

// ============ NotificationAction ============
export type {
  NotificationAction,
  NotificationActionDTO,
  NotificationActionIntent,
  NotificationEntityRef,
  NotificationNavigationIntent,
} from './notification-action';

// ============ NotificationMetadata ============
export type {
  NotificationMetadata,
  NotificationMetadataDTO,
} from './notification-metadata';

// ============ CategoryPreference ============
export type {
  ChannelPreference,
  CategoryPreference,
  CategoryPreferenceDTO,
} from './category-preference';

// ============ QuietHours ============
export type {
  QuietHours,
  QuietHoursDTO,
  QuietHoursWindow,
  NotificationWeekday,
} from './quiet-hours';

// ============ Enum Value Objects ============
export { NotificationType } from './notification-type';

export { NotificationCategory } from './notification-category';

export {
  NotificationPreferenceControl,
  NotificationDndBehavior,
  NotificationTone,
} from './notification-workflow';
export type {
  NotificationWorkflowChannelCapabilityDTO,
  NotificationWorkflowPresentationDefaultsDTO,
  NotificationWorkflowLegacyProjectionDTO,
  NotificationWorkflowDefinitionDTO,
  NotificationGlobalChannelPreferencesDTO,
  NotificationWorkflowChannelOverrideDTO,
  NotificationWorkflowOverridesDTO,
} from './notification-workflow';

export {
  NotificationDeliveryPlanOutcome,
  NotificationDeliveryReason,
  NotificationPreferenceDecisionSource,
} from './delivery-plan';
export type {
  NotificationDeliveryDecisionDTO,
  NotificationDeliveryPlanDTO,
} from './delivery-plan';

export { NotificationChannelType } from './notification-channel-type';


export { ContentType } from './content-type';
