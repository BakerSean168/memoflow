import type { ImportanceLevel } from '../../../shared/value-objects/importance';
import type { UrgencyLevel } from '../../../shared/value-objects/urgency';
import type { NotificationCategory } from './notification-category';
import type { NotificationChannelType } from './notification-channel-type';
import type { NotificationType } from './notification-type';

export const NotificationPreferenceControl = {
  UserConfigurable: 'user_configurable',
  ReadOnly: 'read_only',
} as const;
export type NotificationPreferenceControl =
  (typeof NotificationPreferenceControl)[keyof typeof NotificationPreferenceControl];

export const NotificationDndBehavior = {
  Defer: 'defer',
  Suppress: 'suppress',
  Bypass: 'bypass',
} as const;
export type NotificationDndBehavior =
  (typeof NotificationDndBehavior)[keyof typeof NotificationDndBehavior];

/** Pure presentation tone. Business semantics live exclusively in workflowKey. */
export const NotificationTone = {
  Neutral: 'Neutral',
  Info: 'Info',
  Success: 'Success',
  Warning: 'Warning',
  Error: 'Error',
} as const;
export type NotificationTone = (typeof NotificationTone)[keyof typeof NotificationTone];

export interface NotificationWorkflowPresentationDefaultsDTO {
  tone: NotificationTone;
  importance: ImportanceLevel;
  urgency: UrgencyLevel;
}

export interface NotificationWorkflowChannelCapabilityDTO {
  supported: boolean;
  enabledByDefault: boolean;
  preferenceControl: NotificationPreferenceControl;
  dndBehavior: NotificationDndBehavior;
}

/**
 * Transitional read projection only. `type`/`category` remain on the current
 * Notification Fact DTO while clients migrate, but producers must never choose
 * semantic behavior through them. WorkflowDefinition is the authority.
 */
export interface NotificationWorkflowLegacyProjectionDTO {
  type: NotificationType;
  category: NotificationCategory;
}

/** Canonical notification workflow registry definition (ADR-085). */
export interface NotificationWorkflowDefinitionDTO {
  workflowKey: string;
  topicKey?: string | null;
  groupKey?: string | null;
  presentationDefaults: NotificationWorkflowPresentationDefaultsDTO;
  channels: Partial<Record<NotificationChannelType, NotificationWorkflowChannelCapabilityDTO>>;
  legacyProjection: NotificationWorkflowLegacyProjectionDTO;
  rendererKey?: string | null;
}

export type NotificationGlobalChannelPreferencesDTO = Partial<
  Record<NotificationChannelType, boolean>
>;

export type NotificationWorkflowChannelOverrideDTO = Partial<
  Record<NotificationChannelType, boolean>
>;

export type NotificationWorkflowOverridesDTO = Record<
  string,
  NotificationWorkflowChannelOverrideDTO
>;
