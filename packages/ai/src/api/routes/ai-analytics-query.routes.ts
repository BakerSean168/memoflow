import { Router, type RequestHandler } from 'express';
import {
  RouteRegistrar,
  type OpenApiRegistryLike,
  errorResponse,
  successResponse,
} from '@memoflow/utils/result';
import { QueryAnalyticsSchema, QueryAnalyticsResSchema } from '@memoflow/ai-contracts';
import type { AIAnalyticsQueryController } from '../../server/transport/ai-analytics-query.controller';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole?(roles: string[]): RequestHandler;
}

export function registerAIAnalyticsQueryRoutes(
  controller: AIAnalyticsQueryController,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/ai/analytics',
    defaultTags: ['AI Analytics'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  r.route(
    {
      method: 'post',
      path: '/query',
      summary: '查询分析洞察',
      request: { body: { content: { 'application/json': { schema: QueryAnalyticsSchema } } } },
      responses: {
        200: successResponse(QueryAnalyticsResSchema, '查询成功'),
        400: errorResponse('参数错误'),
      },
    },
    [auth],
    (req, ctx) => controller.query(req.body, ctx),
  );

  return router;
}
