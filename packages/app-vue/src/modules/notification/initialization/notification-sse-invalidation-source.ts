/**
 * Web-only SSE invalidation source for Notification (Step 3).
 *
 * 复用现有 authenticated `/api/v1/notifications/sse` 端点（cookie/cursor/Long-Poll contract）。
 * 每个 message/named `notification` event 只解析最小 metadata（identity/id/operationId/
 * lastEventId），不 parse 成 Notification DTO；每批 invalidation 交给 dispatcher，绝不直接
 * `setQueryData`/`invalidateQueries`。Desktop 不启用 cloud SSE。
 *
 * Reconnect 由 EventSource 自动完成（携带 Last-Event-ID）；跨会话 catch-up 通过持久化
 * cursor（`?lastCursor=`）实现。online 事件对 stale/invalidated active queries dispatch
 * 一次 `reconnect` invalidation。
 */

import type { NotificationDispatchInAppEvent } from '@memoflow/contracts/notification';
import type { ServerStateInvalidationDispatcher } from '../../../platform/server-state';

/** Minimal metadata extracted from an SSE payload (Step 3: no DTO construction). */
interface SseNotificationMetadata {
  id?: string;
  operationId?: string;
  identityId?: string;
  title?: string;
  body?: string | null;
  category?: string;
  type?: string;
  updatedAt?: string;
  importance?: string;
  urgency?: string;
  data?: Record<string, unknown>;
}

function toLiveInAppDispatch(
  metadata: SseNotificationMetadata,
): NotificationDispatchInAppEvent | null {
  if (
    typeof metadata.id !== 'string' ||
    typeof metadata.identityId !== 'string' ||
    typeof metadata.title !== 'string' ||
    typeof metadata.category !== 'string' ||
    typeof metadata.type !== 'string'
  ) {
    return null;
  }
  return metadata as unknown as NotificationDispatchInAppEvent;
}

/** Persistence seam for the identity-scoped cursor. identity-scoped cursor 持久化接口。 */
export interface NotificationSseCursorStore {
  get(): string | undefined;
  set(cursor: string): void;
}

/** Options for the SSE invalidation source. SSE 失效源选项。 */
export interface NotificationSseInvalidationSourceOptions {
  dispatcher: ServerStateInvalidationDispatcher;
  /** Current identity resolver (fail-closed on mismatch). 当前 identity 解析器。 */
  identityScope: () => string;
  /** Absolute SSE endpoint URL. SSE 端点绝对 URL。 */
  url: string;
  cursorStore: NotificationSseCursorStore;
  /**
   * Optional Web presentation for live InApp delivery events. Historical
   * receipt catch-up intentionally never replays OS popups.
   */
  presentInAppDispatch?: (event: NotificationDispatchInAppEvent) => void;
  /** EventSource constructor override (tests). EventSource 构造器覆盖（测试用）。 */
  eventSource?: new (url: string) => EventSource;
}

/**
 * Create the authenticated SSE invalidation source.
 * 创建已认证 SSE 失效源。
 */
export function createNotificationSseInvalidationSource(
  options: NotificationSseInvalidationSourceOptions,
): { start(): void; stop(): void } {
  let source: EventSource | null = null;
  let started = false;

  const handleMessage = (message: MessageEvent<string>): void => {
    const currentIdentity = options.identityScope();
    if (!currentIdentity) return; // fail closed on empty identity

    let metadata: SseNotificationMetadata;
    try {
      metadata = JSON.parse(message.data ?? '{}') as SseNotificationMetadata;
    } catch {
      return; // malformed payload → skip, idempotent refetch on next valid event
    }

    if (metadata.identityId && metadata.identityId !== currentIdentity) return;

    if (message.lastEventId) {
      options.cursorStore.set(message.lastEventId);
    }

    const liveDispatch = toLiveInAppDispatch(metadata);
    if (options.presentInAppDispatch && liveDispatch) {
      try {
        options.presentInAppDispatch(liveDispatch);
      } catch {
        // Device presentation is best-effort; canonical Notification Fact and
        // query invalidation must still proceed.
      }
    }

    void options.dispatcher.invalidate({
      target: 'notification',
      identityScope: currentIdentity,
      source: 'sse',
      entityId: metadata.id,
      dedupeKey: metadata.operationId ?? message.lastEventId ?? metadata.id,
    });
  };

  const handleOnline = (): void => {
    const currentIdentity = options.identityScope();
    if (!currentIdentity) return;
    void options.dispatcher.invalidate({
      target: 'notification',
      identityScope: currentIdentity,
      source: 'reconnect',
    });
  };

  return {
    start() {
      if (started) return;
      started = true;

      const EventSourceCtor = options.eventSource ?? globalThis.EventSource;
      const lastCursor = options.cursorStore.get();
      const url = lastCursor
        ? `${options.url}?lastCursor=${encodeURIComponent(lastCursor)}`
        : options.url;
      source = new EventSourceCtor(url);
      source.addEventListener('notification', handleMessage);
      window.addEventListener('online', handleOnline);
    },

    stop() {
      if (!started) return;
      started = false;
      source?.removeEventListener('notification', handleMessage);
      source?.close();
      source = null;
      window.removeEventListener('online', handleOnline);
    },
  };
}
