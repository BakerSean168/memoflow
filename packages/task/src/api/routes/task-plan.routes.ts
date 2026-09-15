/**
 * Task Plan Routes — Unified Route + OpenAPI Registration
 *
 * 路由定义与 OpenAPI 文档在同一处注册，消除"双重记账"问题。
 * Follows ADR-021/022 split-route pattern.
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
  CreateTaskPlanSchema,
  CreateTaskPlanResponseSchema,
  TaskPlanResponseSchema,
  TaskPlanListResponseSchema,
  TaskOccurrenceResponseSchema,
  ListTaskPlanFiltersSchema,
  TaskPlanOccurrencesQuerySchema,
  UpdateTaskPlanInvocationSchema,
  GenerateOccurrencesInvocationSchema,
  AbandonTaskPlanInvocationSchema,
  BindTaskToGoalInvocationSchema,
  TaskPlanIdCommandInvocationSchema,
} from '@memoflow/contracts/task';
import { brandedId } from '@memoflow/contracts/primitives';
import type { TaskPlanId } from '@memoflow/contracts/primitives';
import type { ListTaskPlanFilters } from '@memoflow/contracts/task';
import type { TaskPlanController } from '../../server/transport/task-plan.controller';
// Residual 983: sole getFirstQueryValue (local dual retired).
import { getFirstQueryValue } from './get-first-query-value';

// ============ Types ============

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole?(roles: string[]): RequestHandler;
}

function parseTemplateFilters(query: Record<string, unknown> | undefined): ListTaskPlanFilters {
  const status = Array.isArray(query?.status)
    ? (query!.status as string[])
    : typeof query?.status === 'string'
      ? [query!.status as string]
      : undefined;
  const goalId =
    typeof query?.goalId === 'string'
      ? (query.goalId as ListTaskPlanFilters['goalId'])
      : undefined;
  const keyResultId =
    typeof query?.keyResultId === 'string'
      ? (query.keyResultId as ListTaskPlanFilters['keyResultId'])
      : undefined;
  const labelIdsAll = Array.isArray(query?.labelIdsAll)
    ? (query!.labelIdsAll as string[])
    : typeof query?.labelIdsAll === 'string'
      ? [query!.labelIdsAll as string]
      : undefined;

  return ListTaskPlanFiltersSchema.parse({ status, goalId, keyResultId, labelIdsAll });
}

function parseTemplateInstancesRange(query: Record<string, unknown> | undefined): {
  from?: number;
  to?: number;
} {
  const fromValue = getFirstQueryValue(query?.from);
  const toValue = getFirstQueryValue(query?.to);
  const from = fromValue ? Number(fromValue) : undefined;
  const to = toValue ? Number(toValue) : undefined;

  return {
    from: Number.isFinite(from) ? from : undefined,
    to: Number.isFinite(to) ? to : undefined,
  };
}

// ============ Route Registration ============

export function registerTaskPlanRoutes(
  controller: TaskPlanController,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/task-plans',
    defaultTags: ['Task Plan'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  // POST / — Create plan
  r.routeWithValidation(
    {
      method: 'post',
      path: '/',
      summary: '创建任务计划',
      request: { body: { content: { 'application/json': { schema: CreateTaskPlanSchema } } } },
      responses: {
        201: successResponse(CreateTaskPlanResponseSchema, '创建成功'),
        400: errorResponse('参数错误'),
      },
      validation: { schema: CreateTaskPlanSchema },
    },
    [auth],
    (data, ctx) => controller.createPlan(data, ctx),
    { successStatus: 201 },
  );

  // GET / — List plans
  r.route(
    {
      method: 'get',
      path: '/',
      summary: '获取任务计划列表',
      request: {
        query: ListTaskPlanFiltersSchema,
      },
      responses: {
        200: successResponse(TaskPlanListResponseSchema, '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.listPlans(parseTemplateFilters(req.query as Record<string, unknown>), ctx),
  );


  // GET /:id — Get plan by ID
  r.route(
    {
      method: 'get',
      path: '/:id',
      summary: '获取任务计划详情',
      request: { params: z.object({ id: brandedId<TaskPlanId>() }) },
      responses: {
        200: successResponse(TaskPlanResponseSchema, '获取成功'),
        404: errorResponse('模板不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.getPlan(req.params!.id, ctx),
  );

  // PUT /:id — Update plan (backwards compatibility)
  r.routeWithValidation(
    {
      method: 'put',
      path: '/:id',
      summary: '更新任务计划',
      request: {
        params: UpdateTaskPlanInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': { schema: UpdateTaskPlanInvocationSchema.shape.body },
          },
        },
      },
      responses: {
        200: successResponse(TaskPlanResponseSchema, '更新成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: UpdateTaskPlanInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.updatePlan(data.params.id, data.body, ctx),
  );

  // PATCH /:id — Update plan (preferred method for partial updates)
  r.routeWithValidation(
    {
      method: 'patch',
      path: '/:id',
      summary: '更新任务计划',
      request: {
        params: UpdateTaskPlanInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': { schema: UpdateTaskPlanInvocationSchema.shape.body },
          },
        },
      },
      responses: {
        200: successResponse(TaskPlanResponseSchema, '更新成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: UpdateTaskPlanInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.updatePlan(data.params.id, data.body, ctx),
  );

  // DELETE /:id — Delete plan
  r.routeWithValidation(
    {
      method: 'delete',
      path: '/:id',
      summary: '删除任务计划',
      request: { params: TaskPlanIdCommandInvocationSchema.shape.params },
      responses: {
        200: successResponse(z.null(), '删除成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: TaskPlanIdCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => controller.deletePlan(data.params.id, ctx),
  );

  // POST /:id/activate — Activate plan
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/activate',
      summary: '激活任务计划',
      request: { params: TaskPlanIdCommandInvocationSchema.shape.params },
      responses: {
        200: successResponse(TaskPlanResponseSchema, '激活成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: TaskPlanIdCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => controller.activatePlan(data.params.id, ctx),
  );

  // POST /:id/abandon — Explicitly close a plan as Abandoned
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/abandon',
      summary: '主动放弃任务计划',
      request: {
        params: AbandonTaskPlanInvocationSchema.shape.params,
        body: { content: { 'application/json': { schema: AbandonTaskPlanInvocationSchema.shape.body } } },
      },
      responses: {
        200: successResponse(TaskPlanResponseSchema, '计划已放弃'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: AbandonTaskPlanInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.abandonPlan(data.params.id, data.body, ctx),
  );

  // POST /:id/pause — Pause plan
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/pause',
      summary: '暂停任务计划',
      request: { params: TaskPlanIdCommandInvocationSchema.shape.params },
      responses: {
        200: successResponse(TaskPlanResponseSchema, '暂停成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: TaskPlanIdCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => controller.pausePlan(data.params.id, ctx),
  );

  // POST /:id/archive — Archive plan
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/archive',
      summary: '归档任务计划',
      request: { params: TaskPlanIdCommandInvocationSchema.shape.params },
      responses: {
        200: successResponse(TaskPlanResponseSchema, '归档成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: TaskPlanIdCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => controller.archivePlan(data.params.id, ctx),
  );

  // POST /:id/generate-occurrences — Generate occurrences for plan
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/generate-occurrences',
      summary: '为任务计划生成发生项',
      request: {
        params: GenerateOccurrencesInvocationSchema.shape.params,
        body: {
          content: { 'application/json': { schema: GenerateOccurrencesInvocationSchema.shape.body } },
        },
      },
      responses: {
        200: successResponse(z.array(TaskOccurrenceResponseSchema), '生成成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: GenerateOccurrencesInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.generateOccurrences(data.params.id, data.body, ctx),
  );

  // GET /:id/occurrences — Get occurrences by plan ID
  r.route(
    {
      method: 'get',
      path: '/:id/occurrences',
      summary: '获取任务计划的发生项列表',
      request: {
        params: z.object({ id: brandedId<TaskPlanId>() }),
        query: TaskPlanOccurrencesQuerySchema,
      },
      responses: {
        200: successResponse(z.array(TaskOccurrenceResponseSchema), '获取成功'),
        404: errorResponse('模板不存在'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.getOccurrencesByPlan(
        req.params!.id,
        ctx,
        parseTemplateInstancesRange(req.query as Record<string, unknown>),
      ),
  );

  // POST /:id/bind-goal — Bind plan to goal
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/bind-goal',
      summary: '绑定任务计划到目标',
      request: {
        params: BindTaskToGoalInvocationSchema.shape.params,
        body: {
          content: { 'application/json': { schema: BindTaskToGoalInvocationSchema.shape.body } },
        },
      },
      responses: {
        200: successResponse(TaskPlanResponseSchema, '绑定成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: BindTaskToGoalInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.bindToGoal(data.params.id, data.body, ctx),
  );

  // POST /:id/unbind-goal — Unbind plan from goal
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/unbind-goal',
      summary: '解除任务计划与目标的绑定',
      request: { params: TaskPlanIdCommandInvocationSchema.shape.params },
      responses: {
        200: successResponse(TaskPlanResponseSchema, '解绑成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: TaskPlanIdCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => controller.unbindFromGoal(data.params.id, ctx),
  );

  return router;
}
