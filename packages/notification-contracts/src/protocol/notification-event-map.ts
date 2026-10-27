import type { NotificationCreatedEvent } from '../domain/events/notification-created.event';
import type { NotificationReadEvent } from '../domain/events/notification-read.event';
import type { NotificationUnreadEvent } from '../domain/events/notification-unread.event';
import type { NotificationArchivedEvent } from '../domain/events/notification-archived.event';
import type { NotificationRestoredEvent } from '../domain/events/notification-restored.event';
import type { NotificationDeletedEvent } from '../domain/events/notification-deleted.event';
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

  /**
   * Dispatch events (integration, not domain events).
   * These use underscore convention for transport-layer events.
   */
  'notification:dispatch_desktop': NotificationDispatchDesktopEvent;
  'notification:dispatch_in_app': NotificationDispatchInAppEvent;
};
