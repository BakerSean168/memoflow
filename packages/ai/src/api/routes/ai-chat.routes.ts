import { z } from 'zod';
import { Router, type RequestHandler } from 'express';
import {
  RouteRegistrar,
  type OpenApiRegistryLike,
  successResponse,
  errorResponse,
} from '@memoflow/utils/result';
import {
  ConversationNameSchema,
  AIConversationClientDTOSchema,
  ConversationListResSchema,
} from '@memoflow/ai-contracts';
import { brandedId } from '@memoflow/shared-primitives';
import type { AiConversationId } from '@memoflow/ai-contracts';
import type { AIChatController } from '../../server/transport/ai-chat.controller';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole?(roles: string[]): RequestHandler;
}

/**
 * Conversation-shell routes only. Assistant messages/history are served by
 * `/ai/runtime/assistant/*`, whose storage authority is Mastra Memory.
 */
export function registerAIChatRoutes(
  controller: AIChatController,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;
  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/ai/chat',
    defaultTags: ['AI Chat'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  r.route(
    {
      method: 'post',
      path: '/conversations',
      summary: '创建 AI 对话',
      request: { body: { content: { 'application/json': { schema: ConversationNameSchema } } } },
      responses: {
        201: successResponse(AIConversationClientDTOSchema, '创建成功'),
        400: errorResponse('参数错误'),
      },
    },
    [auth],
    (req, ctx) => controller.createConversation(req.body, ctx),
    { successStatus: 201 },
  );

  r.route(
    {
      method: 'get',
      path: '/conversations',
      summary: '获取 AI 对话列表',
      request: {
        query: z.object({ page: z.string().optional(), pageSize: z.string().optional() }),
      },
      responses: { 200: successResponse(ConversationListResSchema, '获取成功') },
    },
    [auth],
    (req, ctx) =>
      controller.listConversations(
        ctx,
        Number(req.query?.page ?? 1),
        Number(req.query?.pageSize ?? 20),
      ),
  );

  r.route(
    {
      method: 'get',
      path: '/conversations/:id',
      summary: '获取 AI 对话详情',
      request: { params: z.object({ id: brandedId<AiConversationId>() }) },
      responses: {
        200: successResponse(AIConversationClientDTOSchema, '获取成功'),
        404: errorResponse('未找到'),
      },
    },
    [auth],
    (req, ctx) => controller.getConversation(req.params!.id, ctx),
  );

  r.route(
    {
      method: 'patch',
      path: '/conversations/:id',
      summary: '更新 AI 对话',
      request: {
        params: z.object({ id: brandedId<AiConversationId>() }),
        body: { content: { 'application/json': { schema: ConversationNameSchema } } },
      },
      responses: {
        200: successResponse(AIConversationClientDTOSchema, '更新成功'),
        400: errorResponse('参数错误'),
        404: errorResponse('未找到'),
      },
    },
    [auth],
    (req, ctx) => controller.updateConversation(req.params!.id, req.body, ctx),
  );

  r.route(
    {
      method: 'delete',
      path: '/conversations/:id',
      summary: '删除 AI 对话',
      request: { params: z.object({ id: brandedId<AiConversationId>() }) },
      responses: {
        200: successResponse(z.null(), '删除成功'),
        404: errorResponse('未找到'),
      },
    },
    [auth],
    (req, ctx) => controller.deleteConversation(req.params!.id, ctx),
  );

  return router;
}
