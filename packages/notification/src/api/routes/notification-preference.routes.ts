/**
 * Notification Preference Routes — 通知偏好设置（身份作用域）
 *
 * 由 `routes.ts` 聚合入口调用：`RouteRegistrar` 与 controller 均由入口构造一次
 * 后传入，本文件只负责逐条注册路由与 OpenAPI 元数据。
 *
 * 静态路径 `/preferences` 必须先于 `/:id` 注册（residual 196）。
 */

import type { RequestHandler } from 'express';
import { type RouteRegistrar, successResponse, errorResponse } from '@memoflow/utils/result';
import {
  UpdateNotificationPreferenceSchema,
  NotificationPreferenceResponseSchema,
} from '@memoflow/notification-contracts';
import type { NotificationController } from '../../server/transport/notification.controller';

export interface NotificationPreferenceRouteDeps {
  readonly controller: NotificationController;
  readonly auth: RequestHandler;
}

export function registerNotificationPreferenceRoutes(
  r: RouteRegistrar,
  { controller, auth }: NotificationPreferenceRouteDeps,
): void {
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
}
