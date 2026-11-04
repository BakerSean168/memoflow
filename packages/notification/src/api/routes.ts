/**
 * Notification API Routes — Unified Route + OpenAPI Registration (aggregate)
 *
 * 路由定义与 OpenAPI 文档在同一处注册，消除"双重记账"问题。
 * 按资源域拆分为 `./routes/*`：本文件只构造一次 `router` / `RouteRegistrar` /
 * controller，并按拆分前的顺序调用各域的注册函数（Express 按注册先后匹配）。
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
 *
 * Seams (registration order is the original single-function order):
 *   registerNotificationInboxRoutes      — 收件箱集合/批量（inbox-routes）
 *   registerNotificationPreferenceRoutes — 偏好设置（preference-routes）
 *   registerNotificationActionRoutes     — POST /actions（inbox-routes）
 *   registerNotificationOperationsRoutes — 死信/回执/时间线/审计（operations-routes）
 *   registerNotificationStreamRoutes     — SSE 流（stream-routes）
 *   registerNotificationItemRoutes       — /:id 资源族，必须最后（inbox-routes）
 */

import { Router } from 'express';
import type { RequestHandler } from 'express';
import { RouteRegistrar, type OpenApiRegistryLike } from '@memoflow/utils/result';
import type { NotificationInboxPort, NotificationOperationsPort } from '../server/application';
import { NotificationController } from '../server/transport/notification.controller';
import { NotificationOperationsController } from '../server/transport/notification-operations.controller';
import {
  registerNotificationInboxRoutes,
  registerNotificationActionRoutes,
  registerNotificationItemRoutes,
} from './routes/notification-inbox.routes';
import { registerNotificationPreferenceRoutes } from './routes/notification-preference.routes';
import { registerNotificationOperationsRoutes } from './routes/notification-operations.routes';
import { registerNotificationStreamRoutes } from './routes/notification-stream.routes';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole(roles: string[]): RequestHandler;
}

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

  // 注册顺序与拆分前逐条一致：静态集合路由先于 `/:id`，SSE 亦在其前。
  registerNotificationInboxRoutes(r, { controller, auth });
  registerNotificationPreferenceRoutes(r, { controller, auth });
  registerNotificationActionRoutes(r, { controller, auth });
  registerNotificationOperationsRoutes(r, { operationsController, auth });
  registerNotificationStreamRoutes({ router, inbox, operations, auth });
  registerNotificationItemRoutes(r, { controller, auth });

  return router;
}
