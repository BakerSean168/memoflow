/**
 * Schedule Event Routes — Calendar Entry CRUD + Conflict Detection
 *
 * Routes:
 *   POST   /              — Create schedule event
 *   GET    /              — List events by time range (query: startTime, endTime)
 *   GET    /:id           — Get event by ID
 *   PUT    /:id           — Update event
 *   PATCH  /:id           — Update event (alias)
 *   DELETE /:id           — Delete event
 */

import { z } from 'zod';
import { Router } from 'express';
import type { RequestHandler } from 'express';
import {
  RouteRegistrar,
  type OpenApiRegistryLike,
  successResponse,
  errorResponse,
} from '@memoflow/utils/result';
import {
  CreateScheduleRequestSchema,
  UpdateScheduleRequestSchema,
  DeleteScheduleRequestSchema,
  DetectConflictsRequestSchema,
  ResolveConflictRequestSchema,
  CalendarEntryResponseSchema,
  ConflictDetectionResultSchema,
  CreateScheduleResponseSchema,
  ResolveConflictResponseSchema,
} from '@memoflow/contracts/schedule';
import { brandedId } from '@memoflow/contracts/primitives';
import type { ScheduleId } from '@memoflow/contracts/primitives';
import type { ScheduleEventApplicationPort } from '../server/application';
import { ScheduleEventController } from '../server/transport/schedule-event.controller';

// ============ Types ============

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole(roles: string[]): RequestHandler;
}

// ============ Route Registration ============

export function registerScheduleEventRoutes(
  api: ScheduleEventApplicationPort,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;
  const controller = new ScheduleEventController(api);

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/schedules/events',
    defaultTags: ['ScheduleEvent'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  // POST / — 创建日程事件
  r.route(
    {
      method: 'post',
      path: '/',
      summary: '创建日程事件',
      request: {
        body: { content: { 'application/json': { schema: CreateScheduleRequestSchema } } },
      },
      responses: {
        201: successResponse(CalendarEntryResponseSchema, '创建成功'),
        400: errorResponse('参数错误'),
      },
    },
    [auth],
    (req, ctx) => controller.create(req.body, ctx),
    { successStatus: 201 },
  );

  // GET / — 按时间范围查询日程
  r.route(
    {
      method: 'get',
      path: '/',
      summary: '按时间范围查询日程事件',
      request: {
        query: z.object({
          startTime: z.string().optional().describe('开始时间戳（毫秒）'),
          endTime: z.string().optional().describe('结束时间戳（毫秒）'),
        }),
      },
      responses: {
        200: successResponse(z.array(CalendarEntryResponseSchema), '获取成功'),
      },
    },
    [auth],
    (req, ctx) => {
      const startTime = req.query?.startTime;
      const endTime = req.query?.endTime;
      if (startTime == null && endTime == null) return controller.getAll(ctx);
      return controller.getByTimeRange({ startTime, endTime }, ctx);
    },
  );

  // GET /:id — 获取日程详情
  r.route(
    {
      method: 'get',
      path: '/:id',
      summary: '获取日程事件详情',
      request: { params: z.object({ id: brandedId<ScheduleId>() }) },
      responses: {
        200: successResponse(CalendarEntryResponseSchema, '获取成功'),
        404: errorResponse('日程不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.get(req.params!.id, ctx),
  );

  // PUT /:id — 更新日程
  r.route(
    {
      method: 'put',
      path: '/:id',
      summary: '更新日程事件',
      request: {
        params: z.object({ id: brandedId<ScheduleId>() }),
        body: { content: { 'application/json': { schema: UpdateScheduleRequestSchema } } },
      },
      responses: {
        200: successResponse(CalendarEntryResponseSchema, '更新成功'),
        404: errorResponse('日程不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.update(req.params!.id, req.body, ctx),
  );

  // PATCH /:id — 更新日程（别名）
  r.route(
    {
      method: 'patch',
      path: '/:id',
      skipOpenApi: true,
    },
    [auth],
    (req, ctx) => controller.update(req.params!.id, req.body, ctx),
  );

  // DELETE /:id — 删除日程
  r.route(
    {
      method: 'delete',
      path: '/:id',
      summary: '删除日程事件',
      request: {
        params: z.object({ id: brandedId<ScheduleId>() }),
        body: { content: { 'application/json': { schema: DeleteScheduleRequestSchema } } },
      },
      responses: {
        200: successResponse(z.null(), '删除成功'),
        404: errorResponse('日程不存在'),
        409: errorResponse('版本冲突'),
      },
    },
    [auth],
    (req, ctx) => controller.delete(req.params!.id, req.body, ctx),
  );

  // ==================== Conflict Detection Routes ====================

  // POST /conflicts/detect — 检测冲突（传入日程 DTO）
  r.route(
    {
      method: 'post',
      path: '/conflicts/detect',
      summary: '检测日程冲突',
      request: {
        body: { content: { 'application/json': { schema: DetectConflictsRequestSchema } } },
      },
      responses: {
        200: successResponse(ConflictDetectionResultSchema, '检测完成'),
      },
    },
    [auth],
    (req, ctx) => controller.detectConflicts(req.body, ctx),
  );

  // POST /with-conflict-detection — 创建日程并检测冲突
  r.route(
    {
      method: 'post',
      path: '/with-conflict-detection',
      summary: '创建日程事件（带冲突检测）',
      request: {
        body: { content: { 'application/json': { schema: CreateScheduleRequestSchema } } },
      },
      responses: {
        201: successResponse(CreateScheduleResponseSchema, '创建成功（含冲突信息）'),
        400: errorResponse('参数错误'),
      },
    },
    [auth],
    (req, ctx) => controller.createWithConflictDetection(req.body, ctx),
    { successStatus: 201 },
  );

  // GET /:id/conflicts — 获取指定日程的冲突
  r.route(
    {
      method: 'get',
      path: '/:id/conflicts',
      summary: '获取日程事件冲突',
      request: { params: z.object({ id: brandedId<ScheduleId>() }) },
      responses: {
        200: successResponse(ConflictDetectionResultSchema, '获取成功'),
        404: errorResponse('日程不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.getConflicts(req.params!.id, ctx),
  );

  // POST /:id/resolve-conflict — 解决日程冲突
  r.route(
    {
      method: 'post',
      path: '/:id/resolve-conflict',
      summary: '解决日程冲突',
      request: {
        params: z.object({ id: brandedId<ScheduleId>() }),
        body: {
          content: {
            'application/json': { schema: ResolveConflictRequestSchema },
          },
        },
      },
      responses: {
        200: successResponse(ResolveConflictResponseSchema, '冲突已解决'),
        404: errorResponse('日程不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.resolveConflict(req.params!.id, req.body, ctx),
  );

  return router;
}
