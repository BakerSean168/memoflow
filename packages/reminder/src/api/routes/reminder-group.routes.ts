/**
 * Reminder Group Routes
 *
 * 提醒分组（Routine Profile 兼容表面）的增删改查及批量操作路由。
 *
 * Routes:
 *   POST   /groups                  — Create reminder group
 *   GET    /groups                  — List groups for current user
 *   GET    /groups/:id              — Get group by ID
 *   PUT    /groups/:id              — Update group
 *   DELETE /groups/:id              — Delete group
 *   POST   /groups/:id/batch        — Batch group template operations
 */

import { z } from 'zod';
import { Router, type RequestHandler } from 'express';
import {
  RouteRegistrar,
  type OpenApiRegistryLike,
  successResponse,
  errorResponse,
} from '@memoflow/utils/result';
import {
  CreateReminderGroupSchema,
  UpdateReminderGroupSchema,
  ReminderGroupResponseSchema,
  ReminderGroupListResponseSchema,
} from '@memoflow/contracts/reminder';
import { brandedId } from '@memoflow/contracts/primitives';
import type { ReminderGroupId } from '@memoflow/contracts/primitives';
import type { ReminderController } from '../../server/transport/reminder.controller';

// ============ Types ============

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole(roles: string[]): RequestHandler;
}

// ============ Route Registration ============

export function registerReminderGroupRoutes(
  controller: ReminderController,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/reminders',
    defaultTags: ['Reminder'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  // ==================== Group CRUD ====================

  // POST /groups
  r.route(
    {
      method: 'post',
      path: '/groups',
      summary: '创建提醒分组',
      request: { body: { content: { 'application/json': { schema: CreateReminderGroupSchema } } } },
      responses: {
        201: successResponse(ReminderGroupResponseSchema, '创建成功'),
        400: errorResponse('参数错误'),
      },
    },
    [auth],
    (req, ctx) => controller.createGroup(req.body, ctx),
    { successStatus: 201 },
  );

  // GET /groups
  r.route(
    {
      method: 'get',
      path: '/groups',
      summary: '获取提醒分组列表',
      responses: {
        200: successResponse(ReminderGroupListResponseSchema, '获取成功'),
      },
    },
    [auth],
    (_req, ctx) => controller.listGroups(ctx),
  );

  // GET /groups/:id
  r.route(
    {
      method: 'get',
      path: '/groups/:id',
      summary: '获取提醒分组详情',
      request: { params: z.object({ id: brandedId<ReminderGroupId>() }) },
      responses: {
        200: successResponse(ReminderGroupResponseSchema, '获取成功'),
        404: errorResponse('分组不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.getGroup(req.params!.id, ctx),
  );

  // PUT /groups/:id
  r.route(
    {
      method: 'put',
      path: '/groups/:id',
      summary: '更新提醒分组',
      request: {
        params: z.object({ id: brandedId<ReminderGroupId>() }),
        body: { content: { 'application/json': { schema: UpdateReminderGroupSchema } } },
      },
      responses: {
        200: successResponse(ReminderGroupResponseSchema, '更新成功'),
        404: errorResponse('分组不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.updateGroup(req.params!.id, req.body, ctx),
  );

  // DELETE /groups/:id
  r.route(
    {
      method: 'delete',
      path: '/groups/:id',
      summary: '删除提醒分组',
      request: { params: z.object({ id: brandedId<ReminderGroupId>() }) },
      responses: {
        200: successResponse(z.null(), '删除成功'),
        404: errorResponse('分组不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.deleteGroup(req.params!.id, ctx),
  );

  // ==================== Group Actions ====================

  // POST /groups/:id/toggle
  r.route(
    {
      method: 'post',
      path: '/groups/:id/toggle',
      summary: '切换分组启用/暂停（级联模板）',
      request: { params: z.object({ id: brandedId<ReminderGroupId>() }) },
      responses: {
        200: successResponse(ReminderGroupResponseSchema, '切换成功'),
        404: errorResponse('分组不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.toggleGroup(req.params!.id, ctx),
  );

  return router;
}
