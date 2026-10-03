/**
 * Goal Review Routes
 *
 * 目标复盘路由。
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
  GoalReviewListResSchema,
  GoalReviewSystemContextSchema,
  ReviewContextInvocationSchema,
  CreateReviewInvocationSchema,
  UpdateReviewInvocationSchema,
  DeleteReviewInvocationSchema,
} from '@memoflow/contracts/goal';
import { brandedId } from '@memoflow/contracts/primitives';
import type { GoalId } from '@memoflow/contracts/primitives';
import type { GoalController } from '../../server/transport/goal.controller';

// ============ Types ============

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole(roles: string[]): RequestHandler;
}

// ============ Route Registration ============

export function registerReviewRoutes(
  controller: GoalController,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router({ mergeParams: true });
  const { auth } = middleware;

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/goals',
    defaultTags: ['Goal - Review'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  // POST /:id/reviews — 添加目标复盘
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/reviews',
      summary: '添加目标复盘',
      request: {
        params: CreateReviewInvocationSchema.shape.params,
        body: {
          content: { 'application/json': { schema: CreateReviewInvocationSchema.shape.body } },
        },
      },
      responses: {
        201: successResponse(GoalMutationReceiptSchema, '添加成功'),
        404: errorResponse('目标不存在'),
      },
      validation: {
        schema: CreateReviewInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.addReview(data.params.id, data.body, ctx),
    { successStatus: 201 },
  );

  // GET /:id/reviews/context — review starts from server-computed facts
  r.routeWithValidation(
    {
      method: 'get',
      path: '/:id/reviews/context',
      summary: '获取目标复盘上下文',
      request: {
        params: ReviewContextInvocationSchema.shape.params,
        query: ReviewContextInvocationSchema.shape.query,
      },
      responses: {
        200: successResponse(GoalReviewSystemContextSchema, '查询成功'),
        404: errorResponse('目标不存在'),
      },
      validation: {
        schema: ReviewContextInvocationSchema,
        projectInput: (req) => ({ params: req.params, query: req.query }),
      },
    },
    [auth],
    (data, ctx) =>
      controller.getReviewContext(
        data.params.id,
        data.query.window === undefined ? data.query.windowDays : data.query,
        ctx,
      ),
  );

  // GET /:id/reviews — 获取目标复盘列表
  r.route(
    {
      method: 'get',
      path: '/:id/reviews',
      summary: '获取目标复盘列表',
      request: {
        params: z.object({ id: brandedId<GoalId>() }),
      },
      responses: {
        200: successResponse(GoalReviewListResSchema, '查询成功'),
        404: errorResponse('目标不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.listReviews(req.params!.id, ctx),
  );

  // PUT /:id/reviews/:reviewId — 更新复盘
  r.routeWithValidation(
    {
      method: 'put',
      path: '/:id/reviews/:reviewId',
      summary: '更新目标复盘',
      request: {
        params: UpdateReviewInvocationSchema.shape.params,
        body: {
          content: { 'application/json': { schema: UpdateReviewInvocationSchema.shape.body } },
        },
      },
      responses: {
        200: successResponse(GoalMutationReceiptSchema, '更新成功'),
        404: errorResponse('目标或复盘不存在'),
      },
      validation: {
        schema: UpdateReviewInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.updateReview(data.params.id, data.params.reviewId, data.body, ctx),
  );

  // DELETE /:id/reviews/:reviewId — 删除复盘
  r.routeWithValidation(
    {
      method: 'delete',
      path: '/:id/reviews/:reviewId',
      summary: '删除目标复盘',
      request: {
        params: DeleteReviewInvocationSchema.shape.params,
        query: DeleteReviewInvocationSchema.shape.query,
      },
      responses: {
        200: successResponse(GoalMutationReceiptSchema, '删除成功'),
        404: errorResponse('目标或复盘不存在'),
      },
      validation: {
        schema: DeleteReviewInvocationSchema,
        projectInput: (req) => ({ params: req.params, query: req.query }),
      },
    },
    [auth],
    (data, ctx) => controller.deleteReview(data.params.id, data.params.reviewId, data.query, ctx),
  );

  return router;
}
