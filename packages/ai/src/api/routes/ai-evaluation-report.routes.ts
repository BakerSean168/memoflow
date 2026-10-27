import { Router, type RequestHandler } from 'express';
import { RouteRegistrar, type OpenApiRegistryLike, successResponse } from '@memoflow/utils/result';
import { AIEvaluationOverviewSchema } from '@memoflow/ai-contracts';
import type { AIEvaluationReportController } from '../../server/transport/ai-evaluation-report.controller';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole?(roles: string[]): RequestHandler;
}

export function registerAIEvaluationReportRoutes(
  controller: AIEvaluationReportController,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/ai',
    defaultTags: ['AI'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  r.route(
    {
      method: 'get',
      path: '/evaluations/overview',
      summary: '获取 AI 评测总览',
      responses: {
        200: successResponse(AIEvaluationOverviewSchema, '获取成功'),
      },
    },
    [auth],
    (req) => controller.overview(req.query),
  );

  return router;
}
