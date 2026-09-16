import type { NotificationCreatedEvent } from '../domain/events/notification-created.event';
import type { NotificationReadEvent } from '../domain/events/notification-read.event';
import type { NotificationUnreadEvent } from '../domain/events/notification-unread.event';
import type { NotificationArchivedEvent } from '../domain/events/notification-archived.event';
import type { NotificationRestoredEvent } from '../domain/events/notification-restored.event';
import type { NotificationDeletedEvent } from '../domain/events/notification-deleted.event';
import type { NotificationChannelFailedEvent } from '../domain/events/notification-channel-failed.event';
import type { NotificationTemplateCreatedEvent } from '../domain/events/notification-template-created.event';
import type { NotificationTemplateUpdatedEvent } from '../domain/events/notification-template-updated.event';
import type { NotificationTemplateActivatedEvent } from '../domain/events/notification-template-activated.event';
import type { NotificationTemplateDeactivatedEvent } from '../domain/events/notification-template-deactivated.event';
import type {
  NotificationDispatchDesktopEvent,
  NotificationDispatchInAppEvent,
} from './notification-dispatch-events';

/**
 * Notification Module - Event Map
 * 通知模块 - 事件映射
 *
 * 事件命名规范：notification:{kebab-action-past-tense}
 */
export type NotificationEventMap = {
  'notification:created': NotificationCreatedEvent;
  'notification:read': NotificationReadEvent;
  'notification:unread': NotificationUnreadEvent;
  'notification:archived': NotificationArchivedEvent;
  'notification:restored': NotificationRestoredEvent;
  'notification:deleted': NotificationDeletedEvent;
  'notification:channel-failed': NotificationChannelFailedEvent;

  'notification:template-created': NotificationTemplateCreatedEvent;
  'notification:template-updated': NotificationTemplateUpdatedEvent;
  'notification:template-activated': NotificationTemplateActivatedEvent;
  'notification:template-deactivated': NotificationTemplateDeactivatedEvent;

  /**
   * Dispatch events (integration, not domain events).
   * These use underscore convention for transport-layer events.
   */
  'notification:dispatch_desktop': NotificationDispatchDesktopEvent;
  'notification:dispatch_in_app': NotificationDispatchInAppEvent;
};
