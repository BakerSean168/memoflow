/**
 * Key Result Routes
 *
 * 关键结果的 CRUD 和进度操作路由。
 */

import { z } from 'zod';
import { Router, type RequestHandler } from 'express';
import {
  RouteRegistrar,
  type OpenApiRegistryLike,
  successResponse,
  errorResponse,
} from '@memoflow/utils/result';
import {
  GoalMutationReceiptSchema,
  KeyResultListResSchema,
  AddKeyResultInvocationSchema,
  UpdateKeyResultInvocationSchema,
  UpdateKeyResultProgressInvocationSchema,
  DeleteKeyResultInvocationSchema,
} from '@memoflow/goal-contracts';
import { brandedId } from '@memoflow/shared-primitives';
import type { GoalId } from '@memoflow/goal-contracts';
import type { GoalController } from '../../server/transport/goal.controller';

// ============ Types ============

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole(roles: string[]): RequestHandler;
}

// ============ Route Registration ============

export function registerKeyResultRoutes(
  controller: GoalController,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router({ mergeParams: true });
  const { auth } = middleware;

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/goals',
    defaultTags: ['Goal - Key Result'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  // ==================== Key Result CRUD ====================

  // GET /:id/key-results — 获取关键结果列表
  r.route(
    {
      method: 'get',
      path: '/:id/key-results',
      summary: '获取关键结果列表',
      request: {
        params: z.object({ id: brandedId<GoalId>() }),
      },
      responses: {
        200: successResponse(KeyResultListResSchema, '获取成功'),
        404: errorResponse('目标不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.getKeyResults(req.params!.id, ctx),
  );

  // POST /:id/key-results — 添加关键结果
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/key-results',
      summary: '添加关键结果',
      request: {
        params: AddKeyResultInvocationSchema.shape.params,
        body: {
          content: { 'application/json': { schema: AddKeyResultInvocationSchema.shape.body } },
        },
      },
      responses: {
        201: successResponse(GoalMutationReceiptSchema, '添加成功'),
        404: errorResponse('目标不存在'),
      },
      validation: {
        schema: AddKeyResultInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.addKeyResult(data.params.id, data.body, ctx),
    { successStatus: 201 },
  );

  // PUT /:id/key-results/:krId — 更新关键结果
  r.routeWithValidation(
    {
      method: 'put',
      path: '/:id/key-results/:krId',
      summary: '更新关键结果',
      request: {
        params: UpdateKeyResultInvocationSchema.shape.params,
        body: {
          content: { 'application/json': { schema: UpdateKeyResultInvocationSchema.shape.body } },
        },
      },
      responses: {
        200: successResponse(GoalMutationReceiptSchema, '更新成功'),
        404: errorResponse('目标或关键结果不存在'),
      },
      validation: {
        schema: UpdateKeyResultInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.updateKeyResult(data.params.id, data.params.krId, data.body, ctx),
  );

  // PATCH /:id/key-results/:krId/progress — 更新关键结果进度
  r.routeWithValidation(
    {
      method: 'patch',
      path: '/:id/key-results/:krId/progress',
      summary: '更新关键结果进度',
      request: {
        params: UpdateKeyResultProgressInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': { schema: UpdateKeyResultProgressInvocationSchema.shape.body },
          },
        },
      },
      responses: {
        200: successResponse(GoalMutationReceiptSchema, '更新成功'),
        404: errorResponse('目标或关键结果不存在'),
      },
      validation: {
        schema: UpdateKeyResultProgressInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) =>
      controller.updateKeyResultProgress(data.params.id, data.params.krId, data.body, ctx),
  );

  // DELETE /:id/key-results/:krId — 删除关键结果
  r.routeWithValidation(
    {
      method: 'delete',
      path: '/:id/key-results/:krId',
      summary: '删除关键结果',
      request: {
        params: DeleteKeyResultInvocationSchema.shape.params,
        query: DeleteKeyResultInvocationSchema.shape.query,
      },
      responses: {
        200: successResponse(GoalMutationReceiptSchema, '删除成功'),
        404: errorResponse('目标或关键结果不存在'),
      },
      validation: {
        schema: DeleteKeyResultInvocationSchema,
        projectInput: (req) => ({ params: req.params, query: req.query }),
      },
    },
    [auth],
    (data, ctx) => controller.deleteKeyResult(data.params.id, data.params.krId, data.query, ctx),
  );

  return router;
}
