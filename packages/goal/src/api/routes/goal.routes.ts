/**
 * Goal CRUD & Status Routes
 *
 * 目标的增删改查和状态操作路由。
 * 从 contracts 导入 response schemas，不在本地定义。
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
  CreateGoalSchema,
  ListGoalFiltersSchema,
  GoalClientDTOSchema,
  GoalMutationReceiptSchema,
  QueryGoalsResSchema,
  GetGoalAggregateResSchema,
  UpdateGoalInvocationSchema,
  DeleteGoalInvocationSchema,
  GoalStatusCommandInvocationSchema,
  CloneGoalInvocationSchema,
  BatchKeyResultWeightsInvocationSchema,
} from '@memoflow/contracts/goal';
import type { ListGoalFilters } from '@memoflow/contracts/goal';
import { brandedId } from '@memoflow/contracts/primitives';
import type { GoalId } from '@memoflow/contracts/primitives';
import type { GoalController } from '../../server/transport/goal.controller';
// Residual 985: sole parseBoolean (local dual retired).
import { parseBoolean } from './parse-boolean';

// ============ Helpers ============
// Residual 1065 soft / Residual 1067 keep-boundary:
// Local parseNumber + parseStringArray stay package-local. They are not
// createComposable duals of utils parse-query-value (array-first string /
// empty-string) nor persistence JSON parseStringArray.

function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

/**
 * Normalize raw Express req.query into a canonical ListGoalFilters object.
 * Resolves transport aliases: includeChildren → includeKeyResults, limit → pageSize.
 * 集中 route 层 query alias 兼容，controller 只接收 canonical shape。
 */
function normalizeGoalListQuery(query: Record<string, unknown>): ListGoalFilters {
  return {
    status: parseStringArray(query.status) as ListGoalFilters['status'],
    systemView: query.systemView as ListGoalFilters['systemView'],
    query: (query.query as string | undefined) ?? undefined,
    labelIdsAll: parseStringArray(query.labelIdsAll),
    startDate: parseNumber(query.startDate),
    endDate: parseNumber(query.endDate),
    sortBy: query.sortBy as ListGoalFilters['sortBy'],
    sortOrder: query.sortOrder as ListGoalFilters['sortOrder'],
    page: parseNumber(query.page),
    pageSize: parseNumber(query.pageSize) ?? parseNumber(query.limit),
    includeKeyResults: parseBoolean(query.includeKeyResults) ?? parseBoolean(query.includeChildren),
    includeReviews: parseBoolean(query.includeReviews),
  };
}

// ============ Types ============

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole(roles: string[]): RequestHandler;
}

// ============ Route Registration ============

export function registerGoalCrudRoutes(
  controller: GoalController,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/goals',
    defaultTags: ['Goal'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  // ==================== Goal CRUD ====================

  // POST / — 创建目标
  r.routeWithValidation(
    {
      method: 'post',
      path: '/',
      summary: '创建目标',
      request: { body: { content: { 'application/json': { schema: CreateGoalSchema } } } },
      responses: {
        201: successResponse(GoalMutationReceiptSchema, '创建成功'),
        400: errorResponse('参数错误'),
      },
      validation: { schema: CreateGoalSchema },
    },
    [auth],
    (data, ctx) => controller.create(data, ctx),
    { successStatus: 201 },
  );

  // GET / — 查询目标列表
  r.route(
    {
      method: 'get',
      path: '/',
      summary: '获取目标列表',
      request: { query: ListGoalFiltersSchema },
      responses: {
        200: successResponse(QueryGoalsResSchema, '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.list(normalizeGoalListQuery(req.query as Record<string, unknown>), ctx),
  );

  // GET /search — 搜索目标
  r.route(
    {
      method: 'get',
      path: '/search',
      summary: '搜索目标',
      request: {
        query: z
          .object({
            query: z.string().optional(),
            status: z.string().optional(),
            systemView: z.string().optional(),
          })
          .strict(),
      },
      responses: {
        200: successResponse(QueryGoalsResSchema, '搜索成功'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.search(
        typeof req.query?.query === 'string' ? req.query.query : '',
        ctx,
        typeof req.query?.systemView === 'string' ? req.query.systemView : undefined,
      ),
  );

  // GET /:id — 获取目标详情
  r.route(
    {
      method: 'get',
      path: '/:id',
      summary: '获取目标详情',
      request: { params: z.object({ id: brandedId<GoalId>() }) },
      responses: {
        200: successResponse(GoalClientDTOSchema, '获取成功'),
        404: errorResponse('目标不存在'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.get(req.params!.id, ctx, parseBoolean(req.query?.includeChildren) ?? true),
  );

  // PUT /:id — 更新目标
  r.routeWithValidation(
    {
      method: 'put',
      path: '/:id',
      summary: '更新目标',
      request: {
        params: UpdateGoalInvocationSchema.shape.params,
        body: {
          content: { 'application/json': { schema: UpdateGoalInvocationSchema.shape.body } },
        },
      },
      responses: {
        200: successResponse(GoalMutationReceiptSchema, '更新成功'),
        404: errorResponse('目标不存在'),
      },
      validation: {
        schema: UpdateGoalInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.update(data.params.id, data.body, ctx),
  );

  // PATCH /:id — 更新目标（别名，跳过 OpenAPI 避免重复）
  r.routeWithValidation(
    {
      method: 'patch',
      path: '/:id',
      skipOpenApi: true,
      validation: {
        schema: UpdateGoalInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.update(data.params.id, data.body, ctx),
  );

  // DELETE /:id — 删除目标（软删除）
  r.routeWithValidation(
    {
      method: 'delete',
      path: '/:id',
      summary: '删除目标',
      request: {
        params: DeleteGoalInvocationSchema.shape.params,
        query: DeleteGoalInvocationSchema.shape.query,
      },
      responses: {
        200: successResponse(GoalMutationReceiptSchema, '删除成功'),
        404: errorResponse('目标不存在'),
      },
      validation: {
        schema: DeleteGoalInvocationSchema,
        projectInput: (req) => ({ params: req.params, query: req.query }),
      },
    },
    [auth],
    (data, ctx) => controller.delete(data.params.id, data.query.expectedVersion, ctx),
  );

  // ==================== Goal Status Operations ====================

  // POST /:id/archive — 归档目标
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/archive',
      summary: '归档目标',
      request: {
        params: GoalStatusCommandInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': { schema: GoalStatusCommandInvocationSchema.shape.body },
          },
        },
      },
      responses: {
        200: successResponse(GoalMutationReceiptSchema, '归档成功'),
        404: errorResponse('目标不存在'),
      },
      validation: {
        schema: GoalStatusCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.archive(data.params.id, data.body.expectedVersion, ctx),
  );

  // POST /:id/abandon — 明确放弃目标（不归档）
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/abandon',
      summary: '放弃目标',
      request: {
        params: GoalStatusCommandInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': { schema: GoalStatusCommandInvocationSchema.shape.body },
          },
        },
      },
      responses: {
        200: successResponse(GoalMutationReceiptSchema, '已放弃'),
        404: errorResponse('目标不存在'),
      },
      validation: {
        schema: GoalStatusCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.abandon(data.params.id, data.body.expectedVersion, ctx),
  );

  // POST /:id/activate — 激活目标
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/activate',
      summary: '激活目标',
      request: {
        params: GoalStatusCommandInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': { schema: GoalStatusCommandInvocationSchema.shape.body },
          },
        },
      },
      responses: {
        200: successResponse(GoalMutationReceiptSchema, '激活成功'),
        404: errorResponse('目标不存在'),
      },
      validation: {
        schema: GoalStatusCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.activate(data.params.id, data.body.expectedVersion, ctx),
  );

  // POST /:id/complete — 完成目标
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/complete',
      summary: '完成目标',
      request: {
        params: GoalStatusCommandInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': { schema: GoalStatusCommandInvocationSchema.shape.body },
          },
        },
      },
      responses: {
        200: successResponse(GoalMutationReceiptSchema, '完成成功'),
        404: errorResponse('目标不存在'),
      },
      validation: {
        schema: GoalStatusCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.complete(data.params.id, data.body.expectedVersion, ctx),
  );

  // GET /:id/aggregate — 获取目标聚合视图
  r.route(
    {
      method: 'get',
      path: '/:id/aggregate',
      summary: '获取目标聚合视图',
      request: { params: z.object({ id: brandedId<GoalId>() }) },
      responses: {
        200: successResponse(GetGoalAggregateResSchema, '获取成功'),
        404: errorResponse('目标不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.getAggregate(req.params!.id, ctx),
  );


  // POST /:id/clone — 克隆目标
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/clone',
      summary: '克隆目标',
      request: {
        params: CloneGoalInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': {
              schema: CloneGoalInvocationSchema.shape.body,
            },
          },
        },
      },
      responses: {
        201: successResponse(GoalMutationReceiptSchema, '克隆成功'),
        404: errorResponse('目标不存在'),
      },
      validation: {
        schema: CloneGoalInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body ?? {} }),
      },
    },
    [auth],
    (data, ctx) => controller.cloneGoal(data.params.id, data.body, ctx),
    { successStatus: 201 },
  );

  // PUT /:id/key-results/batch-weight — 批量更新关键结果权重
  r.routeWithValidation(
    {
      method: 'put',
      path: '/:id/key-results/batch-weight',
      summary: '批量更新关键结果权重',
      request: {
        params: BatchKeyResultWeightsInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': {
              schema: BatchKeyResultWeightsInvocationSchema.shape.body,
            },
          },
        },
      },
      responses: {
        200: successResponse(GoalMutationReceiptSchema, '更新成功'),
        404: errorResponse('目标不存在'),
      },
      validation: {
        schema: BatchKeyResultWeightsInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.batchUpdateKeyResultWeights(data.params.id, data.body, ctx),
  );

  return router;
}
