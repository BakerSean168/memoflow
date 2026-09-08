/**
 * Task Template Routes — Unified Route + OpenAPI Registration
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
  CreateTaskTemplateSchema,
  CreateTaskTemplateResponseSchema,
  TaskTemplateResponseSchema,
  TaskTemplateListResponseSchema,
  TaskInstanceResponseSchema,
  ListTaskTemplateFiltersSchema,
  TaskTemplateInstancesQuerySchema,
  UpdateTaskTemplateInvocationSchema,
  GenerateInstancesInvocationSchema,
  AbandonTaskPlanInvocationSchema,
  BindTaskToGoalInvocationSchema,
  TaskTemplateIdCommandInvocationSchema,
} from '@memoflow/contracts/task';
import { brandedId } from '@memoflow/contracts/primitives';
import type { TaskTemplateId } from '@memoflow/contracts/primitives';
import type { ListTaskTemplateFilters } from '@memoflow/contracts/task';
import type { TaskTemplateController } from '../../server/transport/task-template.controller';
// Residual 983: sole getFirstQueryValue (local dual retired).
import { getFirstQueryValue } from './get-first-query-value';

// ============ Types ============

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole?(roles: string[]): RequestHandler;
}

function parseTemplateFilters(query: Record<string, unknown> | undefined): ListTaskTemplateFilters {
  const status = Array.isArray(query?.status)
    ? (query!.status as string[])
    : typeof query?.status === 'string'
      ? [query!.status as string]
      : undefined;
  const goalId =
    typeof query?.goalId === 'string'
      ? (query.goalId as ListTaskTemplateFilters['goalId'])
      : undefined;
  const labelIdsAll = Array.isArray(query?.labelIdsAll)
    ? (query!.labelIdsAll as string[])
    : typeof query?.labelIdsAll === 'string'
      ? [query!.labelIdsAll as string]
      : undefined;

  return { status, goalId, labelIdsAll };
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

export function registerTaskTemplateRoutes(
  controller: TaskTemplateController,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/task-templates',
    defaultTags: ['Task Template'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  // POST / — Create template
  r.routeWithValidation(
    {
      method: 'post',
      path: '/',
      summary: '创建任务模板',
      request: { body: { content: { 'application/json': { schema: CreateTaskTemplateSchema } } } },
      responses: {
        201: successResponse(CreateTaskTemplateResponseSchema, '创建成功'),
        400: errorResponse('参数错误'),
      },
      validation: { schema: CreateTaskTemplateSchema },
    },
    [auth],
    (data, ctx) => controller.createTemplate(data, ctx),
    { successStatus: 201 },
  );

  // GET / — List templates
  r.route(
    {
      method: 'get',
      path: '/',
      summary: '获取任务模板列表',
      request: {
        query: ListTaskTemplateFiltersSchema,
      },
      responses: {
        200: successResponse(TaskTemplateListResponseSchema, '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.listTemplates(parseTemplateFilters(req.query as Record<string, unknown>), ctx),
  );


  // GET /:id — Get template by ID
  r.route(
    {
      method: 'get',
      path: '/:id',
      summary: '获取任务模板详情',
      request: { params: z.object({ id: brandedId<TaskTemplateId>() }) },
      responses: {
        200: successResponse(TaskTemplateResponseSchema, '获取成功'),
        404: errorResponse('模板不存在'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.getTemplate(req.params!.id, ctx, req.query?.includeChildren === 'true'),
  );

  // PUT /:id — Update template (backwards compatibility)
  r.routeWithValidation(
    {
      method: 'put',
      path: '/:id',
      summary: '更新任务模板',
      request: {
        params: UpdateTaskTemplateInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': { schema: UpdateTaskTemplateInvocationSchema.shape.body },
          },
        },
      },
      responses: {
        200: successResponse(TaskTemplateResponseSchema, '更新成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: UpdateTaskTemplateInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.updateTemplate(data.params.id, data.body, ctx),
  );

  // PATCH /:id — Update template (preferred method for partial updates)
  r.routeWithValidation(
    {
      method: 'patch',
      path: '/:id',
      summary: '更新任务模板',
      request: {
        params: UpdateTaskTemplateInvocationSchema.shape.params,
        body: {
          content: {
            'application/json': { schema: UpdateTaskTemplateInvocationSchema.shape.body },
          },
        },
      },
      responses: {
        200: successResponse(TaskTemplateResponseSchema, '更新成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: UpdateTaskTemplateInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.updateTemplate(data.params.id, data.body, ctx),
  );

  // DELETE /:id — Delete template
  r.routeWithValidation(
    {
      method: 'delete',
      path: '/:id',
      summary: '删除任务模板',
      request: { params: TaskTemplateIdCommandInvocationSchema.shape.params },
      responses: {
        200: successResponse(z.null(), '删除成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: TaskTemplateIdCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => controller.deleteTemplate(data.params.id, ctx),
  );

  // POST /:id/activate — Activate template
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/activate',
      summary: '激活任务模板',
      request: { params: TaskTemplateIdCommandInvocationSchema.shape.params },
      responses: {
        200: successResponse(TaskTemplateResponseSchema, '激活成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: TaskTemplateIdCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => controller.activateTemplate(data.params.id, ctx),
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
        200: successResponse(TaskTemplateResponseSchema, '计划已放弃'),
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

  // POST /:id/pause — Pause template
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/pause',
      summary: '暂停任务模板',
      request: { params: TaskTemplateIdCommandInvocationSchema.shape.params },
      responses: {
        200: successResponse(TaskTemplateResponseSchema, '暂停成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: TaskTemplateIdCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => controller.pauseTemplate(data.params.id, ctx),
  );

  // POST /:id/archive — Archive template
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/archive',
      summary: '归档任务模板',
      request: { params: TaskTemplateIdCommandInvocationSchema.shape.params },
      responses: {
        200: successResponse(TaskTemplateResponseSchema, '归档成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: TaskTemplateIdCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => controller.archiveTemplate(data.params.id, ctx),
  );

  // POST /:id/generate-instances — Generate instances for template
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/generate-instances',
      summary: '为模板生成任务实例',
      request: {
        params: GenerateInstancesInvocationSchema.shape.params,
        body: {
          content: { 'application/json': { schema: GenerateInstancesInvocationSchema.shape.body } },
        },
      },
      responses: {
        200: successResponse(z.array(TaskInstanceResponseSchema), '生成成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: GenerateInstancesInvocationSchema,
        projectInput: (req) => ({ params: req.params, body: req.body }),
      },
    },
    [auth],
    (data, ctx) => controller.generateInstances(data.params.id, data.body, ctx),
  );

  // GET /:id/instances — Get instances by template ID
  r.route(
    {
      method: 'get',
      path: '/:id/instances',
      summary: '获取模板的任务实例列表',
      request: {
        params: z.object({ id: brandedId<TaskTemplateId>() }),
        query: TaskTemplateInstancesQuerySchema,
      },
      responses: {
        200: successResponse(z.array(TaskInstanceResponseSchema), '获取成功'),
        404: errorResponse('模板不存在'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.getInstancesByTemplate(
        req.params!.id,
        ctx,
        parseTemplateInstancesRange(req.query as Record<string, unknown>),
      ),
  );

  // POST /:id/bind-goal — Bind template to goal
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/bind-goal',
      summary: '绑定任务模板到目标',
      request: {
        params: BindTaskToGoalInvocationSchema.shape.params,
        body: {
          content: { 'application/json': { schema: BindTaskToGoalInvocationSchema.shape.body } },
        },
      },
      responses: {
        200: successResponse(TaskTemplateResponseSchema, '绑定成功'),
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

  // POST /:id/unbind-goal — Unbind template from goal
  r.routeWithValidation(
    {
      method: 'post',
      path: '/:id/unbind-goal',
      summary: '解除任务模板与目标的绑定',
      request: { params: TaskTemplateIdCommandInvocationSchema.shape.params },
      responses: {
        200: successResponse(TaskTemplateResponseSchema, '解绑成功'),
        404: errorResponse('模板不存在'),
      },
      validation: {
        schema: TaskTemplateIdCommandInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => controller.unbindFromGoal(data.params.id, ctx),
  );

  return router;
}
