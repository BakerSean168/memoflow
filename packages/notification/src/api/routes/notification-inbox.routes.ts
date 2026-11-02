/**
 * Notification Inbox Routes — 收件箱集合、类型化动作与 /:id 资源族
 *
 * 由 `routes.ts` 聚合入口调用：`router` / `RouteRegistrar` / controller 均由入口
 * 构造一次后传入，本文件只负责逐条注册路由与 OpenAPI 元数据。
 *
 * 本域在原 `routes.ts` 中的注册位置被偏好（`/preferences`）与运维
 * （`/dead-letters` …）路由打断，为保持拆分前逐条一致的注册顺序（Express 按
 * 注册先后匹配，`/:id` 资源族必须晚于所有静态路径），本文件按原位置导出三段:
 *   registerNotificationInboxRoutes   — 集合与批量操作（POST / … PATCH /read-all）
 *   registerNotificationActionRoutes  — POST /actions
 *   registerNotificationItemRoutes    — /:id 资源族（必须最后注册）
 */

import { z } from 'zod';
import type { RequestHandler } from 'express';
import { type RouteRegistrar, successResponse, errorResponse } from '@memoflow/utils/result';
// Residual 989: sole parseString/parseNumber (local dual retired).
// Residual 1021: sole parseBoolean (local dual retired).
import { parseBoolean, parseNumber, parseString } from '@memoflow/utils/shared';
import {
  CreateNotificationSchema,
  NotificationQuerySchema,
  NotificationIdsBatchSchema,
  CleanupOldNotificationsSchema,
  NotificationResponseSchema,
  NotificationBatchResultSchema,
  UnreadCountResponseSchema,
  MarkAllNotificationsReadInvocationSchema,
  MarkNotificationReadInvocationSchema,
  MarkNotificationUnreadInvocationSchema,
  ArchiveNotificationInvocationSchema,
  RestoreNotificationInvocationSchema,
  NotificationIdParamsSchema,
  DeleteNotificationInvocationSchema,
  ExecuteNotificationActionSchema,
  ExecuteNotificationActionResponseSchema,
} from '@memoflow/notification-contracts';
import type { NotificationController } from '../../server/transport/notification.controller';

export interface NotificationInboxRouteDeps {
  readonly controller: NotificationController;
  readonly auth: RequestHandler;
}

/**
 * 收件箱集合与批量操作 —— 原始注册顺序中的第 1–7 条。
 */
export function registerNotificationInboxRoutes(
  r: RouteRegistrar,
  { controller, auth }: NotificationInboxRouteDeps,
): void {
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
}

/**
 * 类型化通知动作 —— 原始注册顺序中的第 10 条（位于 `/preferences` 之后）。
 */
export function registerNotificationActionRoutes(
  r: RouteRegistrar,
  { controller, auth }: NotificationInboxRouteDeps,
): void {
  // POST /actions — typed Notification action intent execution.
  r.routeWithValidation(
    {
      method: 'post',
      path: '/actions',
      summary: '执行类型化通知动作',
      request: {
        body: { content: { 'application/json': { schema: ExecuteNotificationActionSchema } } },
      },
      responses: {
        200: successResponse(ExecuteNotificationActionResponseSchema, '动作已记录'),
        404: errorResponse('通知或动作不存在'),
      },
      validation: { schema: ExecuteNotificationActionSchema },
    },
    [auth],
    (data, ctx) =>
      controller.executeAction(data.notificationId, data.actionKey, ctx, data.snoozeDurationMs),
  );
}

/**
 * `/:id` 单条通知资源族 —— 原始注册顺序中的最后 6 条。
 *
 * 必须最后注册：静态路径（`/preferences`、`/dead-letters`、`/receipts`、
 * `/operations/*`、`/sse`）先注册，否则会被 `GET /:id` 遮蔽。
 */
export function registerNotificationItemRoutes(
  r: RouteRegistrar,
  { controller, auth }: NotificationInboxRouteDeps,
): void {
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
      responses: {
        200: successResponse(NotificationResponseSchema, '操作成功'),
        404: errorResponse('通知不存在'),
      },
      validation: {
        schema: MarkNotificationUnreadInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
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
      responses: {
        200: successResponse(NotificationResponseSchema, '操作成功'),
        404: errorResponse('通知不存在'),
      },
      validation: {
        schema: ArchiveNotificationInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
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
      responses: {
        200: successResponse(NotificationResponseSchema, '操作成功'),
        404: errorResponse('通知不存在'),
      },
      validation: {
        schema: RestoreNotificationInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
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
}
