/**
 * Task Instance Routes — Unified Route + OpenAPI Registration
 *
 * 路由定义与 OpenAPI 文档在同一处注册，消除"双重记账"问题。
 * Follows ADR-021/022 split-route pattern.
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
  TaskOccurrenceResponseSchema,
  GetTaskOccurrencesByRangeSchema,
  CompleteTaskOccurrenceInvocationSchema,
  MarkTaskOccurrenceMissedInvocationSchema,
  RescheduleTaskOccurrenceInvocationSchema,
  SkipTaskOccurrenceInvocationSchema,
  TaskOccurrenceIdCommandInvocationSchema,
} from '@memoflow/contracts/task';
import { brandedId } from '@memoflow/contracts/primitives';
import type { TaskOccurrenceId, TaskPlanId } from '@memoflow/contracts/primitives';
import type { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import type { TaskOccurrenceController } from '../../server/transport/task-occurrence.controller';
// Residual 983: sole getFirstQueryValue (local dual retired).
import { getFirstQueryValue } from './get-first-query-value';

// ============ Types ============

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole?(roles: string[]): RequestHandler;
}

function parseTimestampQuery(value: unknown, fallback: number): number {
  const firstValue = getFirstQueryValue(value);
  if (!firstValue) {
    return fallback;
  }

  const parsed = Number(firstValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ============ Route Registration ============

export function registerTaskOccurrenceRoutes(
  controller: TaskOccurrenceController,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/task-occurrences',
    defaultTags: ['Task Instance'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  // GET /by-date-range — Get instances by date range (must be before /:id)
  r.route(
    {
      method: 'get',
      path: '/by-date-range',
      summary: '按日期范围获取任务实例',
      request: {
        query: GetTaskOccurrencesByRangeSchema,
      },
      responses: {
        200: successResponse(z.array(TaskOccurrenceResponseSchema), '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.getInstancesByDateRange(ctx.identityId, {
        startDate: parseTimestampQuery(req.query?.startDate, Date.now()),
        endDate: parseTimestampQuery(req.query?.endDate, Date.now() + 86400000 * 7),
      }),
  );

  // GET / — List instances
  r.route(
    {
      method: 'get',
      path: '/',
      summary: '获取任务实例列表',
      request: {
        query: z.object({
          templateId: brandedId<TaskPlanId>().optional(),
          status: z.string().optional(),
        }),
      },
      responses: {
        200: successResponse(z.array(TaskOccurrenceResponseSchema), '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.listInstances(ctx.identityId, {
        templateId: getFirstQueryValue(req.query?.templateId),
        status: getFirstQueryValue(req.query?.status) as TaskOccurrenceStatus | undefined,
      }),
  );

  // GET /:id — Get instance by ID
  r.route(
    {
      method: 'get',
      path: '/:id',
      summary: '获取任务实例详情',
      request: { params: z.object({ id: brandedId<TaskOccurrenceId>() }) },
      responses: {
        200: successResponse(TaskOccurrenceResponseSchema, '获取成功'),
        404: errorResponse('实例不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.getInstance(req.params!.id, ctx),
  );

  // POST /:id/complete — Complete instance
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/complete',
      summary: '完成任务实例',
      request: {
        params: CompleteTaskOccurrenceInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': { schema: CompleteTaskOccurrenceInvocationSchema.shape.body },
          },
        },
      },
      responses: {
        200: successResponse(TaskOccurrenceResponseSchema, '完成成功'),
        404: errorResponse('实例不存在'),
      },
      validation: {
        schema: CompleteTaskOccurrenceInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.completeInstance(data.params.id, data.body, ctx),
  );

  // POST /:id/skip — Skip instance
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/uncomplete',
      summary: '撤销完成任务实例',
      request: { params: TaskOccurrenceIdCommandInvocationSchema.shape.params },
      responses: {
        200: successResponse(TaskOccurrenceResponseSchema, '撤销完成成功'),
        404: errorResponse('实例不存在'),
      },
      validation: {
        schema: TaskOccurrenceIdCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => controller.uncompleteInstance(data.params.id, ctx),
  );

  // POST /:id/skip — Skip instance
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/skip',
      summary: '跳过任务实例',
      request: {
        params: SkipTaskOccurrenceInvocationSchema.shape.params,
        body: {
          content: { 'application/json': { schema: SkipTaskOccurrenceInvocationSchema.shape.body } },
        },
      },
      responses: {
        200: successResponse(TaskOccurrenceResponseSchema, '跳过成功'),
        404: errorResponse('实例不存在'),
      },
      validation: {
        schema: SkipTaskOccurrenceInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.skipInstance(data.params.id, data.body, ctx),
  );

  // POST /:id/missed — Explicitly record a Missed occurrence fact
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/missed',
      summary: '明确记录任务实例为 Missed',
      request: {
        params: MarkTaskOccurrenceMissedInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': { schema: MarkTaskOccurrenceMissedInvocationSchema.shape.body },
          },
        },
      },
      responses: {
        200: successResponse(TaskOccurrenceResponseSchema, '记录成功'),
        404: errorResponse('实例不存在'),
      },
      validation: {
        schema: MarkTaskOccurrenceMissedInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.markMissedInstance(data.params.id, data.body, ctx),
  );

  // POST /:id/reschedule — owner command for this Task occurrence only
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/reschedule',
      summary: '重新安排任务实例时间',
      request: {
        params: RescheduleTaskOccurrenceInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': { schema: RescheduleTaskOccurrenceInvocationSchema.shape.body },
          },
        },
      },
      responses: {
        200: successResponse(TaskOccurrenceResponseSchema, '重新安排成功'),
        404: errorResponse('实例不存在'),
        409: errorResponse('版本或目标日期冲突'),
      },
      validation: {
        schema: RescheduleTaskOccurrenceInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.rescheduleInstance(data.params.id, data.body, ctx),
  );

  // POST /:id/start — Start instance
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/start',
      summary: '开始任务实例',
      request: { params: TaskOccurrenceIdCommandInvocationSchema.shape.params },
      responses: {
        200: successResponse(TaskOccurrenceResponseSchema, '开始成功'),
        404: errorResponse('实例不存在'),
      },
      validation: {
        schema: TaskOccurrenceIdCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => controller.startInstance(data.params.id, ctx),
  );

  // DELETE /:id — Delete instance
  r.routeWithValidation(
    {
      method: 'delete',
      path: '/:id',
      summary: '删除任务实例',
      request: { params: TaskOccurrenceIdCommandInvocationSchema.shape.params },
      responses: {
        200: successResponse(z.null(), '删除成功'),
        404: errorResponse('实例不存在'),
      },
      validation: {
        schema: TaskOccurrenceIdCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => controller.deleteInstance(data.params.id, ctx),
  );

  return router;
}
