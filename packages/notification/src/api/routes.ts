/**
 * Notification API Routes — Unified Route + OpenAPI Registration
 *
 * 路由定义与 OpenAPI 文档在同一处注册，消除"双重记账"问题。
 *
 * Routes:
 *   POST   /                — Create notification (CreateNotificationSchema)
 *   GET    /                — List/query notifications (NotificationQuerySchema)
 *   GET    /preferences     — Get notification preferences (identity-scoped)
 *   PUT    /preferences     — Update notification preferences (identity-scoped)
 *   GET    /:id             — Get notification by ID
 *   DELETE /:id             — Delete notification
 *   POST   /:id/read        — Mark single notification as read
 *   POST   /batch-read      — Batch mark as read (shared id-batch schema)
 *   POST   /batch-delete    — Batch delete (shared id-batch schema)
 *   POST   /cleanup         — Cleanup old notifications (CleanupOldNotificationsSchema)
 */

import { z } from 'zod';
import { Router } from 'express';
import type { RequestHandler } from 'express';
import {
  RouteRegistrar,
  type OpenApiRegistryLike,
  successResponse,
  errorResponse,
  defaultExtractContext,
} from '@memoflow/utils/result';
// Residual 989: sole parseString/parseNumber (local dual retired).
// Residual 1021: sole parseBoolean (local dual retired).
import { parseBoolean, parseNumber, parseString } from '@memoflow/utils/shared';
import {
  CreateNotificationSchema,
  NotificationQuerySchema,
  NotificationIdsBatchSchema,
  CleanupOldNotificationsSchema,
  UpdateNotificationPreferenceSchema,
  NotificationResponseSchema,
  NotificationBatchResultSchema,
  UnreadCountResponseSchema,
  NotificationPreferenceResponseSchema,
  DeleteNotificationInvocationSchema,
  MarkAllNotificationsReadInvocationSchema,
  MarkNotificationReadInvocationSchema,
  MarkNotificationUnreadInvocationSchema,
  ArchiveNotificationInvocationSchema,
  RestoreNotificationInvocationSchema,
  NotificationIdParamsSchema,
  ReplayDeadLetterInvocationSchema,
  ExecuteNotificationActionSchema,
  ExecuteNotificationActionResponseSchema,
} from '@memoflow/contracts/notification';
import { BusinessOperationReceiptSchema } from '@memoflow/contracts/reliable-messaging';
import {
  OperationAuditRecordSchema,
  OperationTimelineEntrySchema,
} from '@memoflow/contracts/operations';
import type { NotificationInboxPort, NotificationOperationsPort } from '../server/application';
import { NotificationController } from '../server/transport/notification.controller';
import { NotificationOperationsController } from '../server/transport/notification-operations.controller';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole(roles: string[]): RequestHandler;
}

// Residual 1021: parseBoolean elevated to @memoflow/utils/shared.

// ============ Route Registration ============

export function registerNotificationRoutes(
  inbox: NotificationInboxPort,
  operations: NotificationOperationsPort,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;
  const controller = new NotificationController(inbox);
  const operationsController = new NotificationOperationsController(operations);

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/notifications',
    defaultTags: ['Notification'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  // POST / — Create notification
  r.routeWithValidation(
    {
      method: 'post',
      path: '/',
      summary: '创建通知',
      request: { body: { content: { 'application/json': { schema: CreateNotificationSchema } } } },
      responses: {
        201: successResponse(NotificationResponseSchema, '创建成功'),
        400: errorResponse('参数错误'),
      },
      validation: { schema: CreateNotificationSchema },
    },
    [auth],
    (data, ctx) => controller.create(data, ctx),
    { successStatus: 201 },
  );

  // GET / — List/query notifications
  r.route(
    {
      method: 'get',
      path: '/',
      summary: '查询通知列表',
      request: { query: NotificationQuerySchema },
      responses: {
        200: successResponse(z.array(NotificationResponseSchema), '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.list(
        {
          type: parseString(req.query?.type),
          category: parseString(req.query?.category),
          workflowKey: parseString(req.query?.workflowKey),
          topic: parseString(req.query?.topic),
          archiveState: parseString(req.query?.archiveState),
          isRead: parseBoolean(req.query?.isRead),
          relatedEntityType: parseString(req.query?.relatedEntityType),
          relatedEntityId: parseString(req.query?.relatedEntityId),
          startDate: parseNumber(req.query?.startDate),
          endDate: parseNumber(req.query?.endDate),
          keyword: parseString(req.query?.keyword),
          page: parseNumber(req.query?.page),
          limit: parseNumber(req.query?.limit),
          sortBy: parseString(req.query?.sortBy),
          sortOrder: parseString(req.query?.sortOrder),
        },
        ctx,
      ),
  );

  // POST /batch-read — Batch mark as read (must be before /:id)
  r.routeWithValidation(
    {
      method: 'post',
      path: '/batch-read',
      summary: '批量标记为已读',
      request: {
        body: { content: { 'application/json': { schema: NotificationIdsBatchSchema } } },
      },
      responses: {
        200: successResponse(NotificationBatchResultSchema, '操作成功'),
        400: errorResponse('参数错误'),
      },
      validation: { schema: NotificationIdsBatchSchema },
    },
    [auth],
    (data, ctx) => controller.batchMarkAsRead(data, ctx),
  );

  // POST /batch-delete — Batch delete (must be before /:id)
  r.routeWithValidation(
    {
      method: 'post',
      path: '/batch-delete',
      summary: '批量删除通知',
      request: {
        body: { content: { 'application/json': { schema: NotificationIdsBatchSchema } } },
      },
      responses: {
        200: successResponse(NotificationBatchResultSchema, '删除成功'),
        400: errorResponse('参数错误'),
      },
      validation: { schema: NotificationIdsBatchSchema },
    },
    [auth],
    (data, ctx) => controller.batchDelete(data, ctx),
  );

  // POST /cleanup — Cleanup old notifications (must be before /:id)
  r.routeWithValidation(
    {
      method: 'post',
      path: '/cleanup',
      summary: '清理过期通知',
      request: {
        body: { content: { 'application/json': { schema: CleanupOldNotificationsSchema } } },
      },
      responses: {
        200: successResponse(NotificationBatchResultSchema, '清理成功'),
        400: errorResponse('参数错误'),
      },
      validation: { schema: CleanupOldNotificationsSchema },
    },
    [auth],
    (data, ctx) => controller.cleanup(data, ctx),
  );

  // GET /unread-count — Get unread notification count (must be before /:id)
  r.route(
    {
      method: 'get',
      path: '/unread-count',
      summary: '获取未读通知数量',
      responses: {
        200: successResponse(UnreadCountResponseSchema, '获取成功'),
      },
    },
    [auth],
    (_req, ctx) => controller.getUnreadCount(ctx.identityId),
  );

  // PATCH /read-all — Mark all notifications as read (must be before /:id)
  r.routeWithValidation(
    {
      method: 'patch',
      path: '/read-all',
      summary: '标记所有通知为已读',
      responses: {
        200: successResponse(UnreadCountResponseSchema, '操作成功'),
      },
      validation: {
        schema: MarkAllNotificationsReadInvocationSchema,
      },
    },
    [auth],
    (_data, ctx) => controller.markAllAsRead(ctx.identityId),
  );

  // GET /preferences — must register before /:id (residual 196)
  r.route(
    {
      method: 'get',
      path: '/preferences',
      summary: '获取通知偏好',
      responses: {
        200: successResponse(NotificationPreferenceResponseSchema, '获取成功'),
      },
    },
    [auth],
    (_req, ctx) => controller.getPreferences(ctx),
  );

  // PUT /preferences
  r.routeWithValidation(
    {
      method: 'put',
      path: '/preferences',
      summary: '更新通知偏好',
      request: {
        body: { content: { 'application/json': { schema: UpdateNotificationPreferenceSchema } } },
      },
      responses: {
        200: successResponse(NotificationPreferenceResponseSchema, '更新成功'),
        400: errorResponse('参数错误'),
      },
      validation: { schema: UpdateNotificationPreferenceSchema },
    },
    [auth],
    (data, ctx) => controller.updatePreferences(data, ctx),
  );

  // POST /actions — typed Notification action intent execution.
  r.routeWithValidation(
    {
      method: 'post',
      path: '/actions',
      summary: '执行类型化通知动作',
      request: { body: { content: { 'application/json': { schema: ExecuteNotificationActionSchema } } } },
      responses: {
        200: successResponse(ExecuteNotificationActionResponseSchema, '动作已记录'),
        404: errorResponse('通知或动作不存在'),
      },
      validation: { schema: ExecuteNotificationActionSchema },
    },
    [auth],
    (data, ctx) => controller.executeAction(data.notificationId, data.actionKey, ctx),
  );

  // GET /dead-letters — operations-only identity-scoped query
  r.route(
    {
      method: 'get',
      path: '/dead-letters',
      summary: '查询死信通知队列',
      responses: {
        200: successResponse(z.array(BusinessOperationReceiptSchema), '获取成功'),
      },
    },
    [auth],
    (_req, ctx) => operationsController.queryDeadLetters(ctx),
  );

  // POST /dead-letters/:id/replay — Identity-scoped dead-letter replay
  r.routeWithValidation(
    {
      method: 'post',
      path: '/dead-letters/:id/replay',
      summary: '重发死信通知',
      request: { params: ReplayDeadLetterInvocationSchema.shape.params },
      responses: {
        200: successResponse(BusinessOperationReceiptSchema, '重发成功'),
        404: errorResponse('死信通知不存在'),
      },
      validation: {
        schema: ReplayDeadLetterInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => operationsController.replayDeadLetter(data.params.id, ctx),
  );

  // GET /receipts — Delivery receipt timeline query
  r.route(
    {
      method: 'get',
      path: '/receipts',
      summary: '查询通知投递回执时间线',
      responses: {
        200: successResponse(z.array(BusinessOperationReceiptSchema), '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      operationsController.getDeliveryReceipts(ctx, {
        limit: parseNumber(req.query?.limit),
        lastCursor: parseString(req.query?.lastCursor ?? req.query?.since),
        since: parseString(req.query?.since),
        status: parseString(req.query?.status),
      }),
  );

  // GET /operations/timeline — W7 unified operation timeline (identity-scoped)
  r.route(
    {
      method: 'get',
      path: '/operations/timeline',
      summary: '查询统一操作时间线（W7）',
      responses: {
        200: successResponse(z.array(OperationTimelineEntrySchema), '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      operationsController.getOperationTimeline(ctx, {
        status: parseString(req.query?.status),
        limit: parseNumber(req.query?.limit),
      }),
  );

  // GET /operations/audit — W7 audit trail (actor-scoped, least privilege)
  r.route(
    {
      method: 'get',
      path: '/operations/audit',
      summary: '查询操作审计记录（W7，最小权限）',
      responses: {
        200: successResponse(z.array(OperationAuditRecordSchema), '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      operationsController.getOperationAudit(ctx, {
        source: parseString(req.query?.source),
        operationId: parseString(req.query?.operationId),
        limit: parseNumber(req.query?.limit),
      }),
  );

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
    const bufferedLiveEvents: import('../server/application').NotificationSseDeliveryEvent[] = [];
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

  // GET /:id — Get notification by ID
  r.route(
    {
      method: 'get',
      path: '/:id',
      summary: '获取通知详情',
      request: { params: NotificationIdParamsSchema },
      responses: {
        200: successResponse(NotificationResponseSchema, '获取成功'),
        404: errorResponse('通知不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.get(req.params!.id, ctx),
  );

  // DELETE /:id — Delete notification
  r.routeWithValidation(
    {
      method: 'delete',
      path: '/:id',
      summary: '删除通知',
      request: { params: DeleteNotificationInvocationSchema.shape.params },
      responses: {
        200: successResponse(z.null(), '删除成功'),
        404: errorResponse('通知不存在'),
      },
      validation: {
        schema: DeleteNotificationInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => controller.delete(data.params.id, ctx),
  );

  // POST /:id/unread — Mark single notification as unread
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/unread',
      summary: '标记通知为未读',
      request: { params: MarkNotificationUnreadInvocationSchema.shape.params },
      responses: { 200: successResponse(NotificationResponseSchema, '操作成功'), 404: errorResponse('通知不存在') },
      validation: { schema: MarkNotificationUnreadInvocationSchema, projectInput: (req) => ({ params: req.params }) },
    },
    [auth],
    (data, ctx) => controller.markAsUnread(data.params.id, ctx),
  );

  // POST /:id/archive — Archive notification
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/archive',
      summary: '归档通知',
      request: { params: ArchiveNotificationInvocationSchema.shape.params },
      responses: { 200: successResponse(NotificationResponseSchema, '操作成功'), 404: errorResponse('通知不存在') },
      validation: { schema: ArchiveNotificationInvocationSchema, projectInput: (req) => ({ params: req.params }) },
    },
    [auth],
    (data, ctx) => controller.archive(data.params.id, ctx),
  );

  // POST /:id/restore — Restore notification
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/restore',
      summary: '恢复通知',
      request: { params: RestoreNotificationInvocationSchema.shape.params },
      responses: { 200: successResponse(NotificationResponseSchema, '操作成功'), 404: errorResponse('通知不存在') },
      validation: { schema: RestoreNotificationInvocationSchema, projectInput: (req) => ({ params: req.params }) },
    },
    [auth],
    (data, ctx) => controller.restore(data.params.id, ctx),
  );

  // PATCH /:id/read — Mark single notification as read
  r.routeWithValidation(
    {
      method: 'patch',
      path: '/:id/read',
      summary: '标记通知为已读',
      request: { params: MarkNotificationReadInvocationSchema.shape.params },
      responses: {
        200: successResponse(NotificationResponseSchema, '操作成功'),
        404: errorResponse('通知不存在'),
      },
      validation: {
        schema: MarkNotificationReadInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => controller.markAsRead(data.params.id, ctx),
  );

  return router;
}
