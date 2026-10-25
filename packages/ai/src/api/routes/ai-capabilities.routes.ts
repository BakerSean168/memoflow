import { Router, type RequestHandler } from 'express';
import { RouteRegistrar, type OpenApiRegistryLike, successResponse } from '@memoflow/utils/result';
import { AICapabilitiesSchema } from '@memoflow/contracts/ai';
import type { AICapabilitiesController } from '../../server/transport/ai-capabilities.controller';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole?(roles: string[]): RequestHandler;
}

export function registerAICapabilitiesRoutes(
  controller: AICapabilitiesController,
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
      path: '/capabilities',
      summary: '获取 AI 运行时能力',
      responses: {
        200: successResponse(AICapabilitiesSchema, '获取成功'),
      },
    },
    [auth],
    () => controller.get(),
  );

  return router;
}
