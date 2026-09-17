/**
 * Shared Notification click destination policy.
 *
 * Desktop and web both consume the stable navigation intent first. When no
 * explicit intent exists, they fall back to a product category landing route.
 * Raw business payloads and worker details are never parsed here.
 */

import type { Router } from 'vue-router';
import { RendererEventChannels } from '@memoflow/contracts/electron';
import type { ElectronBridge } from '../../../di/keys';
import type { NotificationNavigationIntentDTO } from '@memoflow/contracts/notification';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('notification:click-nav');

const CATEGORY_ROUTE: Readonly<Record<string, string>> = {
  goal: '/goals',
  schedule: '/schedule',
  task: '/tasks',
};

interface ClickedPayload {
  notificationId?: string;
  notificationType?: string;
  notificationCategory?: string;
  category?: string;
  navigationIntent?: NotificationNavigationIntentDTO | null;
  route?: string;
  params?: Record<string, string>;
}

function isNavigationIntent(value: unknown): value is NotificationNavigationIntentDTO {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as NotificationNavigationIntentDTO).route === 'string' &&
    (value as NotificationNavigationIntentDTO).route.trim().length > 0
  );
}

function normalizeCategory(category: unknown): string {
  return typeof category === 'string' ? category.trim().toLowerCase() : '';
}

export function resolveNotificationDestination(
  payload: Pick<ClickedPayload, 'navigationIntent' | 'notificationCategory' | 'category'>,
): { path: string; query?: Record<string, string> } {
  if (isNavigationIntent(payload.navigationIntent)) {
    return {
      path: payload.navigationIntent.route,
      ...(payload.navigationIntent.params ? { query: payload.navigationIntent.params } : {}),
    };
  }

  const category = normalizeCategory(payload.notificationCategory ?? payload.category);
  return { path: CATEGORY_ROUTE[category] ?? '/notifications' };
}

export function hasNotificationExternalDestination(
  payload: Pick<ClickedPayload, 'navigationIntent' | 'notificationCategory' | 'category'>,
): boolean {
  return resolveNotificationDestination(payload).path !== '/notifications';
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
