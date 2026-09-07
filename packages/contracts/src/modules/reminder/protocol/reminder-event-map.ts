import type { ReminderTemplateCreatedEvent } from '../domain/events/reminder-template-created.event';
import type { ReminderTemplateUpdatedEvent } from '../domain/events/reminder-template-updated.event';
import type { ReminderTemplateEnabledEvent } from '../domain/events/reminder-template-enabled.event';
import type { ReminderTemplatePausedEvent } from '../domain/events/reminder-template-paused.event';
import type { ReminderTemplateDeletedEvent } from '../domain/events/reminder-template-deleted.event';
import type { ReminderTemplateEligibilityChangedEvent } from '../domain/events/reminder-template-eligibility-changed.event';
import type { ReminderGroupCreatedEvent } from '../domain/events/reminder-group-created.event';
import type { ReminderGroupUpdatedEvent } from '../domain/events/reminder-group-updated.event';
import type { ReminderGroupDeletedEvent } from '../domain/events/reminder-group-deleted.event';
import type { ReminderGroupEnabledEvent } from '../domain/events/reminder-group-enabled.event';
import type { ReminderGroupPausedEvent } from '../domain/events/reminder-group-paused.event';
import type { ReminderTriggeredEvent } from '../domain/events/reminder-triggered.event';
import type {
  ReminderFrequencyAdjustedEvent,
  ReminderFrequencyAdjustmentRejectedEvent,
  ReminderResponseRecordedEvent,
} from './reminder-analytics-events';

/**
 * Reminder Module - Event Map
 * 提醒模块 - 事件映射
 *
 * 事件命名规范：reminder:{kebab-entity}-{kebab-action-past-tense}
 * 参见：packages/contracts/src/modules/governance/protocol/governance-event-map.ts
 */

export type ReminderEventMap = {
  /**
   * Reminder template created event
   * Triggered when reminder template is created
   */
  'reminder:template-created': ReminderTemplateCreatedEvent;

  /**
   * Reminder template updated event
   * Triggered when reminder template is updated
   */
  'reminder:template-updated': ReminderTemplateUpdatedEvent;

  /**
   * Reminder template enabled event
   * Triggered when reminder template is enabled
   */
  'reminder:template-enabled': ReminderTemplateEnabledEvent;

  /**
   * Reminder template paused event
   * Triggered when reminder template is paused
   */
  'reminder:template-paused': ReminderTemplatePausedEvent;

  /**
   * Reminder template deleted event
   * Triggered when reminder template is deleted
   */
  'reminder:template-deleted': ReminderTemplateDeletedEvent;

  /** External eligibility context changed; scheduling must re-read canonical gates. */
  'reminder:template-eligibility-changed': ReminderTemplateEligibilityChangedEvent;

  /**
   * Reminder template moved event
   * Triggered when reminder template is moved between groups
   */

  /**
   * Reminder group created event
   * Triggered when reminder group is created
   */
  'reminder:group-created': ReminderGroupCreatedEvent;

  /**
   * Reminder group updated event
   * Triggered when reminder group is updated
   */
  'reminder:group-updated': ReminderGroupUpdatedEvent;

  /**
   * Reminder group enabled event
   * Triggered when reminder group is enabled
   */
  'reminder:group-enabled': ReminderGroupEnabledEvent;

  /**
   * Reminder group paused event
   * Triggered when reminder group is paused
   */
  'reminder:group-paused': ReminderGroupPausedEvent;

  /**
   * Reminder group deleted event
   * Triggered when reminder group is deleted
   */
  'reminder:group-deleted': ReminderGroupDeletedEvent;

  /**
   * Reminder triggered event
   * Triggered when reminder fires
   */
  'reminder:triggered': ReminderTriggeredEvent;

  /**
   * Reminder response recorded integration event
   * Triggered when a reminder response entity is persisted
   */
  'reminder:response-recorded': ReminderResponseRecordedEvent;

  /**
   * Reminder frequency adjusted integration event
   * Triggered when the smart-frequency service applies an adjustment
   */
  'reminder:frequency-adjusted': ReminderFrequencyAdjustedEvent;

  /**
   * Reminder frequency adjustment rejected integration event
   * Triggered when the user rejects a smart-frequency adjustment
   */
  'reminder:frequency-adjustment-rejected': ReminderFrequencyAdjustmentRejectedEvent;
};

