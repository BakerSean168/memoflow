/**
 * Notification Stream Routes — 实时 SSE 流
 *
 * 由 `routes.ts` 聚合入口调用：`router`、inbox 与 operations 端口均由入口构造
 * 一次后传入。SSE 直接绑定在 Express router 上（不经 `RouteRegistrar`），
 * 因此不产生 OpenAPI path 注册 —— 与拆分前一致。
 *
 * `/sse` 是静态路径，必须先于 `/:id` 注册。
 */

import type { Router, RequestHandler } from 'express';
import { defaultExtractContext } from '@memoflow/utils/result';
import type {
  NotificationInboxPort,
  NotificationOperationsPort,
  NotificationSseDeliveryEvent,
} from '../../server/application';

export interface NotificationStreamRouteDeps {
  readonly router: Router;
  readonly inbox: NotificationInboxPort;
  readonly operations: NotificationOperationsPort;
  readonly auth: RequestHandler;
}

export function registerNotificationStreamRoutes({
  router,
  inbox,
  operations,
  auth,
}: NotificationStreamRouteDeps): void {
  // GET /sse — Real-time SSE Stream with Last-Event-ID / lastCursor reconnection catch-up
  router.get('/sse', auth, async (req, res) => {
    // RefArch Phase 2: compose the canonical ExecutionContext through the shared
    // Express extractor (producer-owned carrier + auth-resolved principal). The
    // stream is scoped EXCLUSIVELY by `cx.identityId` — no `req.user.id`,
    // request-field or query override can select another identity.
    let identityId: string;
    try {
      identityId = defaultExtractContext(
        req as Parameters<typeof defaultExtractContext>[0],
      ).identityId;
    } catch {
      res.status(500).end();
      return;
    }
    if (!identityId) {
      res.status(401).end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const resWithFlush = res as unknown as { flushHeaders?: () => void };
    if (typeof resWithFlush.flushHeaders === 'function') {
      resWithFlush.flushHeaders();
    }

    const lastEventId =
      (req.headers['last-event-id'] as string) ||
      (req.query?.lastCursor as string) ||
      (req.query?.since as string);

    const seenOperationIds = new Set<string>();
    const bufferedLiveEvents: NotificationSseDeliveryEvent[] = [];
    let isHistoricalQueryFinished = false;

    // Subscribe via the SSE application port (typed event seam) BEFORE query to eliminate window loss.
    const unsubscribe = inbox.subscribeSseEvents((event) => {
      if (event.identityId !== identityId) return;

      const opId =
        (event as unknown as { operationId?: string; id?: string }).operationId ??
        (event as unknown as { id?: string }).id;
      if (opId && seenOperationIds.has(opId)) {
        return; // Skip duplicate event already covered in query
      }

      if (!isHistoricalQueryFinished) {
        bufferedLiveEvents.push(event);
      } else {
        if (opId) seenOperationIds.add(opId);
        const cursor =
          event.updatedAt && opId ? `${event.updatedAt}|${opId}` : new Date().toISOString();
        res.write(`id: ${cursor}\nevent: notification\ndata: ${JSON.stringify(event)}\n\n`);
      }
    });

    req.on('close', () => {
      unsubscribe();
    });

    // Query historical receipts with composite cursor pagination loop (>100 backlog support)
    if (lastEventId && identityId) {
      let currentCursor: string | undefined = lastEventId;
      let hasMore = true;

      while (hasMore) {
        try {
          const receiptsResult = await operations.getDeliveryReceipts(identityId, {
            lastCursor: currentCursor,
            status: 'succeeded',
            limit: 100,
          });

          if (receiptsResult.ok) {
            const receipts = (receiptsResult.data ?? []) as Array<Record<string, unknown>>;
            const previousCursor: string | undefined = currentCursor;
            for (const receipt of receipts) {
              if (receipt.operationId) {
                seenOperationIds.add(String(receipt.operationId));
              }
              const cursor = `${receipt.updatedAt}|${receipt.operationId}`;
              res.write(`id: ${cursor}\nevent: notification\ndata: ${JSON.stringify(receipt)}\n\n`);
              currentCursor = cursor;
            }

            if (receipts.length < 100 || currentCursor === previousCursor) {
              hasMore = false;
            }
          } else {
            hasMore = false;
            res.write(
              `event: error\ndata: ${JSON.stringify({ message: receiptsResult.error.message })}\n\n`,
            );
            res.end();
            return;
          }
        } catch (loopErr) {
          hasMore = false;
          res.write(
            `event: error\ndata: ${JSON.stringify({ message: loopErr instanceof Error ? loopErr.message : String(loopErr) })}\n\n`,
          );
          res.end();
          return;
        }
      }
    }

    // Flush buffered live events that were not returned in historical query
    isHistoricalQueryFinished = true;
    for (const event of bufferedLiveEvents) {
      const opId = event.operationId ?? event.id;
      if (!opId || !seenOperationIds.has(opId)) {
        if (opId) seenOperationIds.add(opId);
        const cursor =
          event.updatedAt && opId ? `${event.updatedAt}|${opId}` : new Date().toISOString();
        res.write(`id: ${cursor}\nevent: notification\ndata: ${JSON.stringify(event)}\n\n`);
      }
    }
  });
}
