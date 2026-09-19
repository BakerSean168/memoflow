/**
 * Task Occurrence Routes — Unified Route + OpenAPI Registration
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
  SetTaskOccurrenceChecklistItemInvocationSchema,
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
    defaultTags: ['Task Occurrence'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  // GET /by-date-range — Get occurrences by date range (must be before /:id)
  r.route(
    {
      method: 'get',
      path: '/by-date-range',
      summary: '按日期范围获取任务发生项',
      request: {
        query: GetTaskOccurrencesByRangeSchema,
      },
      responses: {
        200: successResponse(z.array(TaskOccurrenceResponseSchema), '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.getOccurrencesByDateRange(ctx.identityId, {
        startDate: parseTimestampQuery(req.query?.startDate, Date.now()),
        endDate: parseTimestampQuery(req.query?.endDate, Date.now() + 86400000 * 7),
      }),
  );

  // GET / — List occurrences
  r.route(
    {
      method: 'get',
      path: '/',
      summary: '获取任务发生项列表',
      request: {
        query: z.object({
          planId: brandedId<TaskPlanId>().optional(),
          status: z.string().optional(),
        }),
      },
      responses: {
        200: successResponse(z.array(TaskOccurrenceResponseSchema), '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.listOccurrences(ctx.identityId, {
        planId: getFirstQueryValue(req.query?.planId),
        status: getFirstQueryValue(req.query?.status) as TaskOccurrenceStatus | undefined,
      }),
  );

  // GET /:id — Get occurrence by ID
  r.route(
    {
      method: 'get',
      path: '/:id',
      summary: '获取任务发生项详情',
      request: { params: z.object({ id: brandedId<TaskOccurrenceId>() }) },
      responses: {
        200: successResponse(TaskOccurrenceResponseSchema, '获取成功'),
        404: errorResponse('实例不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.getOccurrence(req.params!.id, ctx),
  );

  // POST /:id/complete — Complete occurrence
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/complete',
      summary: '完成任务发生项',
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
    (data, ctx) => controller.completeOccurrence(data.params.id, data.body, ctx),
  );

  // POST /:id/skip — Skip occurrence
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/uncomplete',
      summary: '撤销完成任务发生项',
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
    (data, ctx) => controller.uncompleteOccurrence(data.params.id, ctx),
  );

  // POST /:id/skip — Skip occurrence
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/skip',
      summary: '跳过任务发生项',
      request: {
        params: SkipTaskOccurrenceInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': { schema: SkipTaskOccurrenceInvocationSchema.shape.body },
          },
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
    (data, ctx) => controller.skipOccurrence(data.params.id, data.body, ctx),
  );

  // POST /:id/missed — Explicitly record a Missed occurrence fact
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/missed',
      summary: '明确记录任务发生项为 Missed',
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
    (data, ctx) => controller.markOccurrenceMissed(data.params.id, data.body, ctx),
  );

  // POST /:id/checklist — owner command for one occurrence checklist snapshot item
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/checklist',
      summary: '更新任务 occurrence 清单项',
      request: {
        params: SetTaskOccurrenceChecklistItemInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': {
              schema: SetTaskOccurrenceChecklistItemInvocationSchema.shape.body,
            },
          },
        },
      },
      responses: {
        200: successResponse(TaskOccurrenceResponseSchema, '清单项更新成功'),
        404: errorResponse('Occurrence 或清单项不存在'),
        409: errorResponse('Occurrence 版本冲突'),
      },
      validation: {
        schema: SetTaskOccurrenceChecklistItemInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.setOccurrenceChecklistItem(data.params.id, data.body, ctx),
  );

  // POST /:id/reschedule — owner command for this Task occurrence only
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/reschedule',
      summary: '重新安排任务发生项时间',
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
    (data, ctx) => controller.rescheduleOccurrence(data.params.id, data.body, ctx),
  );

  // POST /:id/start — Start occurrence
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/start',
      summary: '开始任务发生项',
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
    (data, ctx) => controller.startOccurrence(data.params.id, ctx),
  );

  // DELETE /:id — Delete occurrence
  r.routeWithValidation(
    {
      method: 'delete',
      path: '/:id',
      summary: '删除任务发生项',
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
    (data, ctx) => controller.deleteOccurrence(data.params.id, ctx),
  );

  return router;
}
