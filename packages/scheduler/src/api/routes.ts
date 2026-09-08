/** Read-only Temporal Engine worker diagnostics routes. */
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
import type { SchedulerApplicationPort } from '../server/application';
import { SchedulerController } from '../server/transport/schedule.controller';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole(roles: string[]): RequestHandler;
}

function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
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

export function registerSchedulerRoutes(
  api: SchedulerApplicationPort,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const controller = new SchedulerController(api);
  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/schedules',
    defaultTags: ['Scheduler'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  r.route(
    {
      method: 'get',
      path: '/tasks/due',
      summary: '获取待执行调度任务诊断信息',
      responses: { 200: successResponse(z.array(ScheduleTaskResponseSchema), '获取成功') },
    },
    [middleware.auth],
    (_req, ctx) => controller.getDueTasks(ctx),
  );

  r.route(
    {
      method: 'get',
      path: '/tasks',
      summary: '获取调度任务诊断列表',
      request: { query: ScheduleTaskQueryParamsSchema },
      responses: { 200: successResponse(z.array(ScheduleTaskResponseSchema), '获取成功') },
    },
    [middleware.auth],
    (req, ctx) => controller.listTasks({
      sourceModule: parseString(req.query?.sourceModule),
      sourceEntityId: parseString(req.query?.sourceEntityId),
      status: parseString(req.query?.status),
      enabled: parseBoolean(req.query?.enabled),
      search: parseString(req.query?.search),
      page: parseNumber(req.query?.page),
      limit: parseNumber(req.query?.limit),
      sortBy: parseString(req.query?.sortBy),
      sortOrder: parseString(req.query?.sortOrder),
    }, ctx),
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
    [middleware.auth],
    (req, ctx) => controller.getTask(req.params!.id, ctx),
  );
  return router;
}
