/**
 * Goal Record Routes
 *
 * 目标进度记录（GoalRecord）路由。
 *
 * Routes:
 *   POST   /:id/key-results/:krId/records          — 创建记录
 *   PUT    /:id/key-results/:krId/records/:recordId — 编辑记录
 *   GET    /:id/key-results/:krId/records           — 按 KeyResult 查询记录
 *   GET    /:id/records                             — 按 Goal 查询记录
 *   DELETE /:id/key-results/:krId/records/:recordId — 删除记录
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
  GoalRecordListResSchema,
  CreateRecordInvocationSchema,
  UpdateRecordInvocationSchema,
  DeleteRecordInvocationSchema,
} from '@memoflow/goal-contracts';
import { brandedId } from '@memoflow/shared-primitives';
import type { GoalId, KeyResultId } from '@memoflow/goal-contracts';
import type { GoalController } from '../../server/transport/goal.controller';

// ============ Types ============

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole(roles: string[]): RequestHandler;
}

// ============ Route Registration ============

export function registerRecordRoutes(
  controller: GoalController,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router({ mergeParams: true });
  const { auth } = middleware;

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/goals',
    defaultTags: ['Goal - Record'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  // POST /:id/key-results/:krId/records — 创建进度记录
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/key-results/:krId/records',
      summary: '创建进度记录',
      request: {
        params: CreateRecordInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': {
              schema: CreateRecordInvocationSchema.shape.body,
            },
          },
        },
      },
      responses: {
        201: successResponse(GoalMutationReceiptSchema, '创建成功'),
        404: errorResponse('目标或关键结果不存在'),
      },
      validation: {
        schema: CreateRecordInvocationSchema,
        projectInput: (req) => ({
          params: req.params,
          body: { ...(req.body as Record<string, unknown>), keyResultId: req.params?.krId },
        }),
      },
    },
    [auth],
    (data, ctx) => controller.createRecord(data.params.id, data.params.krId, data.body, ctx),
    { successStatus: 201 },
  );

  // PUT /:id/key-results/:krId/records/:recordId — 编辑用户记录并重算 KR
  r.routeWithValidation(
    {
      method: 'put',
      path: '/:id/key-results/:krId/records/:recordId',
      summary: '编辑进度记录',
      request: {
        params: UpdateRecordInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': { schema: UpdateRecordInvocationSchema.shape.body },
          },
        },
      },
      responses: {
        200: successResponse(GoalMutationReceiptSchema, '更新成功'),
        404: errorResponse('记录不存在'),
      },
      validation: {
        schema: UpdateRecordInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) =>
      controller.updateRecord(
        data.params.id,
        data.params.krId,
        data.params.recordId,
        data.body,
        ctx,
      ),
  );

  // GET /:id/key-results/:krId/records — 按 KeyResult 查询记录
  r.route(
    {
      method: 'get',
      path: '/:id/key-results/:krId/records',
      summary: '按关键结果查询进度记录',
      request: {
        params: z.object({
          id: brandedId<GoalId>(),
          krId: brandedId<KeyResultId>(),
        }),
        query: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
          offset: z.coerce.number().int().min(0).default(0).optional(),
        }),
      },
      responses: {
        200: successResponse(GoalRecordListResSchema, '查询成功'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.listRecordsByKeyResult(
        req.params!.id,
        req.params!.krId,
        req.query as { limit?: number; offset?: number },
        ctx,
      ),
  );

  // GET /:id/records — 按 Goal 查询所有记录
  r.route(
    {
      method: 'get',
      path: '/:id/records',
      summary: '按目标查询所有进度记录',
      request: {
        params: z.object({ id: brandedId<GoalId>() }),
        query: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
          offset: z.coerce.number().int().min(0).default(0).optional(),
        }),
      },
      responses: {
        200: successResponse(GoalRecordListResSchema, '查询成功'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.listRecordsByGoal(
        req.params!.id,
        req.query as { limit?: number; offset?: number },
        ctx,
      ),
  );

  // DELETE /:id/key-results/:krId/records/:recordId — 删除记录
  r.routeWithValidation(
    {
      method: 'delete',
      path: '/:id/key-results/:krId/records/:recordId',
      summary: '删除进度记录',
      request: {
        params: DeleteRecordInvocationSchema.shape.params,
        query: DeleteRecordInvocationSchema.shape.query,
      },
      responses: {
        200: successResponse(GoalMutationReceiptSchema, '删除成功'),
        404: errorResponse('记录不存在'),
      },
      validation: {
        schema: DeleteRecordInvocationSchema,
        projectInput: (req) => ({ params: req.params, query: req.query }),
      },
    },
    [auth],
    (data, ctx) =>
      controller.deleteRecord(
        data.params.id,
        data.params.krId,
        data.params.recordId,
        data.query,
        ctx,
      ),
  );

  return router;
}
