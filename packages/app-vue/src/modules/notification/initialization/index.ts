/**
 * Notification module startup hook (RefArch Phase 5 — eventBus → dispatcher only).
 *
 * 重写自旧版「构造 DTO + 直接写 store」：现在只把 `{identityScope, entityId, dedupeKey,
 * source}` 交给 dispatcher，不 import Notification store、不构造 NotificationClientDTO
 * （计划 §3.3 / Step 3）。event payload 只是 freshness hint，绝不用 `setQueryData` patch cache。
 *
 * 每次 runtime（web / desktop renderer）在组合根显式调用，并注入 dispatcher 与当前
 * identity resolver；stop 幂等。
 */

import type {
  NotificationDispatchInAppEvent,
  NotificationEventMap,
} from '@memoflow/contracts/notification';
import { createTypedEventSubscriber, eventBus } from '@memoflow/utils/domain';
import { createLogger } from '@memoflow/utils/logger';
import type { ServerStateInvalidationDispatcher } from '../../../platform/server-state';

const logger = createLogger('notification:init');
const notificationEvents =
  createTypedEventSubscriber<Pick<NotificationEventMap, 'notification:dispatch_in_app'>>(eventBus);

/** Startup hook dependencies. startup hook 依赖（Step 3）。 */
export interface NotificationStartupHookOptions {
  /** Sole invalidation owner. 失效唯一入口。 */
  dispatcher: ServerStateInvalidationDispatcher;
  /** Current identity resolver for fail-closed checks. 当前 identity 解析器（用于 fail-closed 校验）。 */
  identityScope: () => string;
  /**
   * Optional host-owned device presentation. Web uses this for a browser OS
   * notification while keeping the Notification Fact/InApp event canonical.
   */
  presentInAppDispatch?: (event: NotificationDispatchInAppEvent) => void;
}

/**
 * Create the Notification startup hook that routes `notification:dispatch_in_app` events
 * into typed invalidation intents.
 * 创建 Notification startup hook：把 `notification:dispatch_in_app` 事件转成 typed
 * invalidation intent 交给 dispatcher。
 */
export function createNotificationStartupHook(options: NotificationStartupHookOptions): {
  start(): void;
  stop(): void;
} {
  let started = false;

  const handleNotificationDispatch = (event: NotificationDispatchInAppEvent): void => {
    const currentIdentity = options.identityScope();
    if (!currentIdentity || event.identityId !== currentIdentity) {
      // Identity mismatch / empty → fail closed；不 invalidate 其它 identity（§3.3）。
      return;
    }
    try {
      options.presentInAppDispatch?.(event);
    } catch (error) {
      logger.warn('Notification device presentation failed', { error });
    }

    void options.dispatcher.invalidate({
      target: 'notification',
      identityScope: currentIdentity,
      source: 'event-bus',
      entityId: event.id,
      dedupeKey: event.operationId ?? event.id,
    });
  };

  return {
    start() {
      if (started) return;
      started = true;
      notificationEvents.on('notification:dispatch_in_app', handleNotificationDispatch);
      logger.info('Notification event handlers initialized');
    },

    stop() {
      if (!started) return;
      started = false;
      notificationEvents.off('notification:dispatch_in_app', handleNotificationDispatch);
    },
  };
}
