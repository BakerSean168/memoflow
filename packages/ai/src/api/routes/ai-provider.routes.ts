import { z } from 'zod';
import { Router, type RequestHandler } from 'express';
import {
  RouteRegistrar,
  type OpenApiRegistryLike,
  successResponse,
  errorResponse,
} from '@memoflow/utils/result';
import {
  CommitAIProviderOnboardingSchema,
  ProbeAIProviderReplacementSchema,
  CommitAIProviderReplacementSchema,
  ProbeAIProviderConnectionResSchema,
  UpdateAIProviderConfigSchema,
  TestAIProviderSchema,
  AIProviderConfigClientDTOSchema,
  AIProviderModelCatalogSnapshotSchema,
  ListAIProviderConfigsResSchema,
  TestAIProviderResultDTOSchema,
} from '@memoflow/ai-contracts';
import { brandedId } from '@memoflow/contracts/primitives';
import type { AiProviderConfigId } from '@memoflow/ai-contracts';
import type { AIProviderConfigController } from '../../server/transport/ai-provider-config.controller';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole?(roles: string[]): RequestHandler;
}

export function registerAIProviderRoutes(
  controller: AIProviderConfigController,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/ai/providers',
    defaultTags: ['AI Provider'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  // POST / — Create provider
  r.route(
    {
      method: 'post',
      path: '/',
      summary: '创建 AI 提供商配置',
      request: {
        body: { content: { 'application/json': { schema: CommitAIProviderOnboardingSchema } } },
      },
      responses: {
        201: successResponse(AIProviderConfigClientDTOSchema, '创建成功'),
        400: errorResponse('参数错误'),
      },
    },
    [auth],
    (req, ctx) => controller.create(req.body, ctx),
    { successStatus: 201 },
  );

  // GET / — List providers
  r.route(
    {
      method: 'get',
      path: '/',
      summary: '获取 AI 提供商配置列表',
      responses: {
        200: successResponse(ListAIProviderConfigsResSchema, '获取成功'),
      },
    },
    [auth],
    (_req, ctx) => controller.list(ctx),
  );

  // GET /:id — Get provider
  r.route(
    {
      method: 'get',
      path: '/:id',
      summary: '获取 AI 提供商配置',
      request: {
        params: z.object({ id: brandedId<AiProviderConfigId>() }),
      },
      responses: {
        200: successResponse(AIProviderConfigClientDTOSchema, '获取成功'),
        404: errorResponse('未找到'),
      },
    },
    [auth],
    (req, ctx) => controller.get(req.params!.id, ctx),
  );

  // PATCH /:id — Update provider
  r.route(
    {
      method: 'patch',
      path: '/:id',
      summary: '更新 AI 提供商配置',
      request: {
        params: z.object({ id: brandedId<AiProviderConfigId>() }),
        body: { content: { 'application/json': { schema: UpdateAIProviderConfigSchema } } },
      },
      responses: {
        200: successResponse(AIProviderConfigClientDTOSchema, '更新成功'),
        400: errorResponse('参数错误'),
        404: errorResponse('未找到'),
      },
    },
    [auth],
    (req, ctx) => controller.update(req.params!.id, req.body, ctx),
  );

  // DELETE /:id — Delete provider
  r.route(
    {
      method: 'delete',
      path: '/:id',
      summary: '删除 AI 提供商配置',
      request: {
        params: z.object({ id: brandedId<AiProviderConfigId>() }),
      },
      responses: {
        200: successResponse(z.null(), '删除成功'),
        404: errorResponse('未找到'),
      },
    },
    [auth],
    (req, ctx) => controller.delete(req.params!.id, ctx),
  );

  // POST /test — Test provider connection
  r.route(
    {
      method: 'post',
      path: '/test',
      summary: '测试 AI 提供商连接',
      request: { body: { content: { 'application/json': { schema: TestAIProviderSchema } } } },
      responses: {
        200: successResponse(TestAIProviderResultDTOSchema, '测试成功'),
        400: errorResponse('参数错误'),
      },
    },
    [auth],
    (req, ctx) => controller.test(req.body, ctx),
  );

  // POST /:id/replacement/probe — Validate a replacement connection without mutating Provider
  r.route(
    {
      method: 'post',
      path: '/:id/replacement/probe',
      summary: '验证已有 AI Provider 的替换连接',
      request: {
        params: z.object({ id: brandedId<AiProviderConfigId>() }),
        body: { content: { 'application/json': { schema: ProbeAIProviderReplacementSchema } } },
      },
      responses: {
        200: successResponse(ProbeAIProviderConnectionResSchema, '验证成功'),
        400: errorResponse('参数或 endpoint 不可用'),
        404: errorResponse('Provider 未找到'),
        503: errorResponse('Provider unavailable'),
      },
    },
    [auth],
    (req, ctx) => controller.probeReplacement(req.params!.id, req.body, ctx),
  );

  // POST /:id/replacement/commit — Atomically replace endpoint/secret/default model
  r.route(
    {
      method: 'post',
      path: '/:id/replacement/commit',
      summary: '提交已有 AI Provider 的已验证替换连接',
      request: {
        params: z.object({ id: brandedId<AiProviderConfigId>() }),
        body: { content: { 'application/json': { schema: CommitAIProviderReplacementSchema } } },
      },
      responses: {
        200: successResponse(AIProviderConfigClientDTOSchema, '替换成功'),
        400: errorResponse('参数错误'),
        404: errorResponse('Provider 未找到'),
        409: errorResponse('Provider 或 onboarding session 已发生并发变化'),
      },
    },
    [auth],
    (req, ctx) => controller.commitReplacement(req.params!.id, req.body, ctx),
  );

  // POST /:id/set-default — Set default provider
  r.route(
    {
      method: 'post',
      path: '/:id/set-default',
      summary: '设置默认 AI 提供商',
      request: {
        params: z.object({ id: brandedId<AiProviderConfigId>() }),
      },
      responses: {
        200: successResponse(z.null(), '设置成功'),
        404: errorResponse('未找到'),
      },
    },
    [auth],
    (req, ctx) => controller.setDefault(req.params!.id, ctx),
  );

  // POST /:id/refresh-models — Refresh provider models
  r.route(
    {
      method: 'post',
      path: '/:id/refresh-models',
      summary: '刷新 AI 提供商模型列表',
      request: {
        params: z.object({ id: brandedId<AiProviderConfigId>() }),
      },
      responses: {
        200: successResponse(AIProviderModelCatalogSnapshotSchema, '刷新成功'),
        404: errorResponse('未找到'),
      },
    },
    [auth],
    (req, ctx) => controller.refreshModels(req.params!.id, ctx),
  );

  return router;
}
