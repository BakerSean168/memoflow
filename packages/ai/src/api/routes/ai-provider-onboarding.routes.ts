import { Router, type RequestHandler } from 'express';
import {
  RouteRegistrar,
  type OpenApiRegistryLike,
  successResponse,
  errorResponse,
} from '@memoflow/utils/result';
import {
  ListAIProviderCatalogResSchema,
  ProbeAIProviderConnectionSchema,
  ProbeAIProviderConnectionResSchema,
  TestAIProviderOnboardingModelSchema,
  TestAIProviderOnboardingModelResSchema,
} from '@memoflow/ai-contracts';
import type { AIProviderConfigController } from '../../server/transport/ai-provider-config.controller';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole?(roles: string[]): RequestHandler;
}

export function registerAIProviderOnboardingRoutes(
  controller: AIProviderConfigController,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;
  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/ai',
    defaultTags: ['AI Provider Onboarding'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  r.route(
    {
      method: 'get',
      path: '/provider-catalog',
      summary: '获取 AI Provider onboarding catalog',
      responses: {
        200: successResponse(ListAIProviderCatalogResSchema, '获取成功'),
      },
    },
    [auth],
    () => controller.catalog(),
  );

  r.route(
    {
      method: 'post',
      path: '/provider-connections/probe',
      summary: '验证 Provider credential 并发现模型，不创建 Provider',
      request: {
        body: { content: { 'application/json': { schema: ProbeAIProviderConnectionSchema } } },
      },
      responses: {
        200: successResponse(ProbeAIProviderConnectionResSchema, '验证成功'),
        400: errorResponse('参数或 endpoint 不可用'),
        401: errorResponse('Provider credential 无效'),
        429: errorResponse('Provider rate limited'),
        503: errorResponse('Provider unavailable'),
      },
    },
    [auth],
    (req, ctx) => controller.probe(req.body, ctx),
  );

  r.route(
    {
      method: 'post',
      path: '/provider-connections/test-model',
      summary: '测试 onboarding 中用户显式选择的模型',
      request: {
        body: { content: { 'application/json': { schema: TestAIProviderOnboardingModelSchema } } },
      },
      responses: {
        200: successResponse(TestAIProviderOnboardingModelResSchema, '模型测试成功'),
        400: errorResponse('参数错误'),
        404: errorResponse('Onboarding session 不存在或已过期'),
        503: errorResponse('Provider unavailable'),
      },
    },
    [auth],
    (req, ctx) => controller.testOnboardingModel(req.body, ctx),
  );

  return router;
}
