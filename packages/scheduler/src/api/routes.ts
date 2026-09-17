/** Read-only canonical Temporal Engine diagnostics routes. */
import { z } from 'zod';
import { Router } from 'express';
import type { RequestHandler } from 'express';
import {
  RouteRegistrar,
  type OpenApiRegistryLike,
  successResponse,
} from '@memoflow/utils/result';
import {
  ScheduledInvocationDiagnosticQuerySchema,
  ScheduledInvocationDiagnosticSchema,
} from '@memoflow/contracts/schedule';
import type { SchedulerApplicationPort } from '../server/application';
import { SchedulerController } from '../server/transport/schedule.controller';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole(roles: string[]): RequestHandler;
}

export function registerSchedulerRoutes(
  api: SchedulerApplicationPort,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const controller = new SchedulerController(api);
  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/scheduler',
    defaultTags: ['Scheduler'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  r.route(
    {
      method: 'get',
      path: '/invocations/due',
      summary: '获取当前账户已到期的 Scheduler invocation 诊断信息',
      responses: {
        200: successResponse(z.array(ScheduledInvocationDiagnosticSchema), '获取成功'),
      },
    },
    [middleware.auth],
    (_req, ctx) => controller.listDueInvocations(ctx),
  );

  r.route(
    {
      method: 'get',
      path: '/invocations',
      summary: '获取当前账户 Scheduler invocation 诊断列表',
      request: { query: ScheduledInvocationDiagnosticQuerySchema },
      responses: {
        200: successResponse(z.array(ScheduledInvocationDiagnosticSchema), '获取成功'),
      },
    },
    [middleware.auth],
    (req, ctx) =>
      controller.listInvocations(ScheduledInvocationDiagnosticQuerySchema.parse(req.query ?? {}), ctx),
  );

  r.route(
    {
      method: 'get',
      path: '/invocations/:id',
      summary: '获取 Scheduler invocation 诊断详情',
      request: { params: z.object({ id: z.string().min(1) }) },
      responses: {
        200: successResponse(ScheduledInvocationDiagnosticSchema.nullable(), '获取成功'),
      },
    },
    [middleware.auth],
    (req, ctx) => controller.getInvocation(req.params!.id, ctx),
  );

  return router;
}
