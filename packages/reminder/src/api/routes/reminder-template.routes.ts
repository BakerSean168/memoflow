/**
 * Reminder Template Routes
 *
 * 提醒模板的增删改查路由。
 *
 * Routes:
 *   POST   /templates          — Create reminder template
 *   GET    /templates          — List templates for current user
 *   GET    /templates/upcoming — Get upcoming reminders
 *   GET    /templates/:id      — Get template by ID
 *   PUT    /templates/:id      — Update template
 *   DELETE /templates/:id      — Delete template
 */

import { z } from 'zod';
import { Router, type RequestHandler } from 'express';
import {
  RouteRegistrar,
  type OpenApiRegistryLike,
  successResponse,
  errorResponse,
} from '@memoflow/utils/result';
// Residual 989: sole parseString/parseNumber (local dual retired).
import { parseNumber, parseString } from '@memoflow/utils/shared';
import {
  CreateReminderTemplateSchema,
  UpdateReminderTemplateSchema,
  ReplaceRoutineProfilesSchema,
  GetUpcomingRemindersSchema,
  GetUpcomingRemindersResSchema,
  GetReminderTodayScheduleSchema,
  GetReminderTodayScheduleResSchema,
  ReminderTemplateResponseSchema,
  ReminderTemplateListResponseSchema,
  ReminderHistoryResponseSchema,
  ReminderResponseItemSchema,
  RecordReminderResponseSchema,
  ResponseRecordResultSchema,
  ResponseStatsResultSchema,
  FrequencyAnalysisResultSchema,
  FrequencyAdjustmentResultSchema,
} from '@memoflow/contracts/reminder';
import { brandedId } from '@memoflow/contracts/primitives';
import type { ReminderTemplateId } from '@memoflow/contracts/primitives';
import type { ReminderController } from '../../server/transport/reminder.controller';

// ============ Helpers ============
// Residual 989: parseString/parseNumber elevated to @memoflow/utils/shared.

// ============ Types ============

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole(roles: string[]): RequestHandler;
}

// ============ Route Registration ============

export function registerReminderTemplateRoutes(
  controller: ReminderController,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/reminders',
    defaultTags: ['Reminder'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  // ==================== Template CRUD ====================

  // POST /templates
  r.route(
    {
      method: 'post',
      path: '/templates',
      summary: '创建提醒模板',
      request: {
        body: { content: { 'application/json': { schema: CreateReminderTemplateSchema } } },
      },
      responses: {
        201: successResponse(ReminderTemplateResponseSchema, '创建成功'),
        400: errorResponse('参数错误'),
      },
    },
    [auth],
    (req, ctx) => controller.createTemplate(req.body, ctx),
    { successStatus: 201 },
  );

  // GET /templates
  r.route(
    {
      method: 'get',
      path: '/templates',
      summary: '获取提醒模板列表',
      responses: {
        200: successResponse(ReminderTemplateListResponseSchema, '获取成功'),
      },
    },
    [auth],
    (_req, ctx) => controller.listTemplates(ctx),
  );

  // GET /templates/upcoming
  r.route(
    {
      method: 'get',
      path: '/templates/upcoming',
      summary: '获取即将到来的提醒',
      request: {
        query: GetUpcomingRemindersSchema,
      },
      responses: {
        200: successResponse(GetUpcomingRemindersResSchema, '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.getUpcomingReminders(
        {
          days: parseNumber(req.query?.days),
          limit: parseNumber(req.query?.limit),
          importanceLevel: parseString(req.query?.importanceLevel),
          type: parseString(req.query?.type),
          timezone: parseString(req.query?.timezone),
        },
        ctx,
      ),
  );

  // GET /templates/today-schedule
  r.route(
    {
      method: 'get',
      path: '/templates/today-schedule',
      summary: '获取今天剩余的提醒时间表',
      request: {
        query: GetReminderTodayScheduleSchema,
      },
      responses: {
        200: successResponse(GetReminderTodayScheduleResSchema, '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.getTodaySchedule(
        {
          limit: parseNumber(req.query?.limit),
          includeExpired:
            typeof req.query?.includeExpired === 'string'
              ? req.query.includeExpired === 'true'
              : undefined,
          timezone: parseString(req.query?.timezone),
        },
        ctx,
      ),
  );

  // GET /templates/:id
  r.route(
    {
      method: 'get',
      path: '/templates/:id',
      summary: '获取提醒模板详情',
      request: { params: z.object({ id: brandedId<ReminderTemplateId>() }) },
      responses: {
        200: successResponse(ReminderTemplateResponseSchema, '获取成功'),
        404: errorResponse('模板不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.getTemplate(req.params!.id, ctx),
  );

  // PUT /templates/:id
  r.route(
    {
      method: 'put',
      path: '/templates/:id',
      summary: '更新提醒模板',
      request: {
        params: z.object({ id: brandedId<ReminderTemplateId>() }),
        body: { content: { 'application/json': { schema: UpdateReminderTemplateSchema } } },
      },
      responses: {
        200: successResponse(ReminderTemplateResponseSchema, '更新成功'),
        404: errorResponse('模板不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.updateTemplate(req.params!.id, req.body, ctx),
  );

  // DELETE /templates/:id
  r.route(
    {
      method: 'delete',
      path: '/templates/:id',
      summary: '删除提醒模板',
      request: { params: z.object({ id: brandedId<ReminderTemplateId>() }) },
      responses: {
        200: successResponse(z.null(), '删除成功'),
        404: errorResponse('模板不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.deleteTemplate(req.params!.id, ctx),
  );

  // ==================== Template Actions ====================

  // POST /templates/:id/toggle
  r.route(
    {
      method: 'post',
      path: '/templates/:id/toggle',
      summary: '切换提醒模板启用/暂停状态',
      request: { params: z.object({ id: brandedId<ReminderTemplateId>() }) },
      responses: {
        200: successResponse(ReminderTemplateResponseSchema, '切换成功'),
        404: errorResponse('模板不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.toggleTemplate(req.params!.id, ctx),
  );

  // PUT /templates/:id/profiles
  r.route(
    {
      method: 'put',
      path: '/templates/:id/profiles',
      summary: '替换 Routine 的 ProfileMembership 集合',
      request: {
        params: z.object({ id: brandedId<ReminderTemplateId>() }),
        body: { content: { 'application/json': { schema: ReplaceRoutineProfilesSchema } } },
      },
      responses: {
        200: successResponse(ReminderTemplateResponseSchema, 'ProfileMembership 更新成功'),
        404: errorResponse('Routine 或 Profile 不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.replaceTemplateProfiles(req.params!.id, req.body, ctx),
  );

  // GET /templates/:id/history
  r.route(
    {
      method: 'get',
      path: '/templates/:id/history',
      summary: '获取提醒模板触发历史',
      request: { params: z.object({ id: brandedId<ReminderTemplateId>() }) },
      responses: {
        200: successResponse(z.array(ReminderHistoryResponseSchema), '获取成功'),
        404: errorResponse('模板不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.getTemplateHistory(req.params!.id, ctx),
  );

  // ==================== Response Routes ====================

  // POST /templates/:id/response
  r.route(
    {
      method: 'post',
      path: '/templates/:id/response',
      summary: '记录提醒响应',
      request: {
        params: z.object({ id: brandedId<ReminderTemplateId>() }),
        body: {
          content: {
            'application/json': {
              schema: RecordReminderResponseSchema,
            },
          },
        },
      },
      responses: {
        201: successResponse(ResponseRecordResultSchema, '记录成功'),
        404: errorResponse('模板不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.recordResponse(req.params!.id, req.body, ctx),
    { successStatus: 201 },
  );

  // GET /templates/:id/responses
  r.route(
    {
      method: 'get',
      path: '/templates/:id/responses',
      summary: '获取提醒响应历史',
      request: { params: z.object({ id: brandedId<ReminderTemplateId>() }) },
      responses: {
        200: successResponse(z.array(ReminderResponseItemSchema), '获取成功'),
        404: errorResponse('模板不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.getTemplateResponses(req.params!.id, ctx),
  );

  // GET /templates/:id/responses/stats
  r.route(
    {
      method: 'get',
      path: '/templates/:id/responses/stats',
      summary: '获取提醒响应统计',
      request: { params: z.object({ id: brandedId<ReminderTemplateId>() }) },
      responses: {
        200: successResponse(ResponseStatsResultSchema, '获取成功'),
        404: errorResponse('模板不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.getResponseStats(req.params!.id, ctx),
  );

  // ==================== Frequency Analysis Routes ====================

  // GET /templates/:id/frequency-analysis
  r.route(
    {
      method: 'get',
      path: '/templates/:id/frequency-analysis',
      summary: '分析提醒频率效果',
      request: { params: z.object({ id: brandedId<ReminderTemplateId>() }) },
      responses: {
        200: successResponse(FrequencyAnalysisResultSchema, '分析成功'),
        404: errorResponse('模板不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.analyzeFrequency(req.params!.id, ctx),
  );

  // POST /templates/:id/frequency-adjustment
  r.route(
    {
      method: 'post',
      path: '/templates/:id/frequency-adjustment',
      summary: '应用频率调整',
      request: {
        params: z.object({ id: brandedId<ReminderTemplateId>() }),
        body: {
          content: {
            'application/json': {
              schema: z.object({ action: z.string(), customInterval: z.number().optional() }),
            },
          },
        },
      },
      responses: {
        200: successResponse(FrequencyAdjustmentResultSchema, '调整成功'),
        404: errorResponse('模板不存在'),
      },
    },
    [auth],
    (req, ctx) => controller.adjustFrequency(req.params!.id, req.body, ctx),
  );

  return router;
}
