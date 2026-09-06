/**
 * Schedule worker diagnostics API — Unified Route + OpenAPI Registration.
 *
 * Raw ScheduleTask is internal Scheduler persistence. Product callers may
 * inspect worker state, but cannot create/update/pause/resume/complete/cancel/
 * delete worker jobs directly. Business mutations flow through owner-domain
 * commands -> SchedulingPort.
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
  ScheduleTaskQueryParamsSchema,
  ScheduleTaskResponseSchema,
} from '@memoflow/contracts/schedule';
import { brandedId } from '@memoflow/contracts/primitives';
import type { ScheduleTaskId } from '@memoflow/contracts/primitives';
import {
  OperationTimelineEntrySchema,
  OperationAuditRecordSchema,
} from '@memoflow/contracts/operations';
import type { ScheduleApplicationPort } from '../server/application';
import { ScheduleController } from '../server/transport/schedule.controller';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole(roles: string[]): RequestHandler;
}

// Residual 1073 keep-boundary: route query coercion intentionally differs from shared helpers.
function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  return isNaN(num) ? undefined : num;
}

function parseString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
}

export function registerScheduleRoutes(
  api: ScheduleApplicationPort,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;
  const controller = new ScheduleController(api);

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/schedules',
    defaultTags: ['Schedule'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  // Keep /due before /:id so Express does not treat "due" as an id.
  r.route(
    {
      method: 'get',
      path: '/tasks/due',
      summary: '获取待执行调度任务诊断信息',
      responses: {
        200: successResponse(z.array(ScheduleTaskResponseSchema), '获取成功'),
      },
    },
    [auth],
    (_req, ctx) => controller.getDueTasks(ctx),
  );

  r.route(
    {
      method: 'get',
      path: '/tasks',
      summary: '获取调度任务诊断列表',
      request: { query: ScheduleTaskQueryParamsSchema },
      responses: {
        200: successResponse(z.array(ScheduleTaskResponseSchema), '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.listTasks(
        {
          sourceModule: parseString(req.query?.sourceModule),
          sourceEntityId: parseString(req.query?.sourceEntityId),
          status: parseString(req.query?.status),
          enabled: parseBoolean(req.query?.enabled),
          search: parseString(req.query?.search),
          page: parseNumber(req.query?.page),
          limit: parseNumber(req.query?.limit),
          sortBy: parseString(req.query?.sortBy),
          sortOrder: parseString(req.query?.sortOrder),
        },
        ctx,
      ),
  );

  r.route(
    {
      method: 'get',
      path: '/tasks/:id',
      summary: '获取调度任务诊断详情',
      request: { params: z.object({ id: brandedId<ScheduleTaskId>() }) },
      responses: {
        200: successResponse(ScheduleTaskResponseSchema, '获取成功'),
        404: errorResponse('任务不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.getTask(req.params!.id, ctx),
  );

  // W7 rebuild operations are audited operational controls, not raw task CRUD.
  r.route(
    {
      method: 'get',
      path: '/operations/rebuild/timeline',
      summary: '查询冲突重算 operation timeline（W7）',
      responses: {
        200: successResponse(z.array(OperationTimelineEntrySchema), '获取成功'),
      },
    },
    [auth],
    (_req, ctx) => controller.queryRebuildTimeline(ctx),
  );

  r.route(
    {
      method: 'post',
      path: '/operations/rebuild/:id/replay',
      summary: '重放失败的冲突重算并记录审计（W7）',
      request: { params: z.object({ id: z.string().min(1) }) },
      responses: {
        200: successResponse(OperationTimelineEntrySchema, '重放成功'),
        404: errorResponse('操作不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.replayRebuildOutbox(req.params!.id, ctx),
  );

  r.route(
    {
      method: 'get',
      path: '/operations/rebuild/audit',
      summary: '查询冲突重算审计记录（W7，最小权限）',
      responses: {
        200: successResponse(z.array(OperationAuditRecordSchema), '获取成功'),
      },
    },
    [auth],
    (_req, ctx) => controller.getOperationAudit(ctx),
  );

  return router;
}
