/**
 * Notification Value Objects
 * 通知值对象导出
 */

// ============ NotificationAction ============
export type {
  NotificationAction,
  NotificationActionDTO,
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

// ============ DoNotDisturbConfig ============
export type {
  DoNotDisturbConfig,
  DoNotDisturbConfigDTO,
} from './do-not-disturb-config';

// ============ RateLimit ============
export type {
  RateLimit,
  RateLimitDTO,
} from './rate-limit';

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

export { RelatedEntityType } from './related-entity-type';

export { NotificationChannelType } from './notification-channel-type';


export { NotificationActionType } from './notification-action-type';

export { ContentType } from './content-type';
