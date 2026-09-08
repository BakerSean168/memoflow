/** Planner/Calendar reliability operations API. */
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
  OperationTimelineEntrySchema,
  OperationAuditRecordSchema,
} from '@memoflow/contracts/operations';
import type { ScheduleApplicationPort } from '../server/application';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole(roles: string[]): RequestHandler;
}

export function registerScheduleRoutes(
  api: ScheduleApplicationPort,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;
  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/schedules',
    defaultTags: ['Schedule'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  r.route(
    {
      method: 'get',
      path: '/operations/rebuild/timeline',
      summary: '查询冲突重算 operation timeline（W7）',
      responses: { 200: successResponse(z.array(OperationTimelineEntrySchema), '获取成功') },
    },
    [auth],
    (_req, ctx) => api.queryRebuildTimeline(ctx),
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
    (req, ctx) => api.replayRebuildOutbox(req.params!.id, ctx),
  );

  r.route(
    {
      method: 'get',
      path: '/operations/rebuild/audit',
      summary: '查询冲突重算审计记录（W7，最小权限）',
      responses: { 200: successResponse(z.array(OperationAuditRecordSchema), '获取成功') },
    },
    [auth],
    (_req, ctx) => api.getOperationAudit(ctx),
  );

  return router;
}
