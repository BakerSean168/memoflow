/**
 * Shared Notification click destination policy.
 *
 * Desktop and web both consume the stable navigation intent first. When no
 * explicit intent exists, they fall back to a product category landing route.
 * Raw business payloads and worker details are never parsed here.
 */

import type { Router } from 'vue-router';
import { RendererEventChannels } from '@memoflow/contracts/electron';
import type { NotificationNavigationIntentDTO } from '@memoflow/contracts/notification';
import type { ElectronBridge } from '../../../di/keys';
import { createLogger } from '@memoflow/utils/logger';
import { resolveNotificationDestination } from '../notification-destination';

export {
  hasNotificationExternalDestination,
  resolveNotificationDestination,
} from '../notification-destination';

const logger = createLogger('notification:click-nav');

interface ClickedPayload {
  notificationId?: string;
  notificationType?: string;
  notificationCategory?: string;
  category?: string;
  navigationIntent?: NotificationNavigationIntentDTO | null;
  route?: string;
  params?: Record<string, string>;
}

export function createNotificationClickNavigation(
  router: Router,
  getBridge: () => ElectronBridge | undefined,
): { start(): void; stop(): void } {
  let started = false;

  const handleClick = (...args: unknown[]): void => {
    const payload = (args[0] ?? {}) as ClickedPayload;
    const destination = resolveNotificationDestination(payload);
    logger.info('[Notification] Click navigation', {
      notificationId: payload.notificationId,
      route: destination,
    });
    void router.push(destination).catch((error) => {
      logger.error('[Notification] Click navigation failed', {
        route: destination,
        error: String(error),
      });
    });
  };

  return {
    start() {
      if (started) return;
      started = true;
      const bridge = getBridge();
      if (!bridge) {
        logger.warn('[Notification] No desktop bridge; click navigation disabled');
        return;
      }
      bridge.on(RendererEventChannels.NOTIFICATION_CLICKED, handleClick);
      logger.info('[Notification] Click navigation started');
    },

    stop() {
      if (!started) return;
      started = false;
      getBridge()?.off(RendererEventChannels.NOTIFICATION_CLICKED, handleClick);
    },
  };
}
