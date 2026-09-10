/**
 * Setting API Routes — Unified Route + OpenAPI Registration
 *
 * Routes:
 *   GET    /              — 获取用户设置
 *   PATCH  /:category     — 按分类更新用户设置 (PatchUserSettingSchema)
 *   POST   /reset         — 重置用户设置 (ResetUserSettingPublicSchema)
 *   POST   /export        — 导出设置 (ExportSettingsSchema)
 *   POST   /import        — 导入设置 (ImportSettingsSchema)
 *   GET    /defaults      — 获取默认设置
 */

import { z } from 'zod';
import { Router } from 'express';
import type { RequestHandler } from 'express';
import {
  RouteRegistrar,
  type OpenApiRegistryLike,
  successResponse,
  errorResponse,
} from '@memoflow/utils/result';
import {
  ResetUserSettingPublicSchema,
  ExportSettingsSchema,
  ImportSettingsSchema,
  UserSettingResponseSchema,
  ExportSettingsResponseSchema,
  ImportSettingsResponseSchema,
  PatchPreferenceNamespaceBodySchema,
  PreferenceMutationReceiptSchema,
  PreferenceNamespacePathSchema,
  PreferenceNamespaceResponseSchema,
  ResetPreferenceNamespaceBodySchema,
  ResetUserPreferencesBodySchema,
  ResetUserPreferencesResponseSchema,
  UserPreferenceProfileSchema,
} from '@memoflow/contracts/setting';
import { SettingController } from '../server/transport';
import type { SettingApplicationPort } from '../server/application';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole(roles: string[]): RequestHandler;
}

// ============ Route Registration ============

export function registerSettingRoutes(
  api: SettingApplicationPort,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;
  const controller = new SettingController(api);

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/settings',
    defaultTags: ['Setting'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  // Canonical User Preferences — presentation/regional only.
  r.route(
    {
      method: 'get',
      path: '/preferences',
      summary: '获取规范用户偏好',
      responses: { 200: successResponse(UserPreferenceProfileSchema, '获取成功') },
    },
    [auth],
    (_req, ctx) => controller.getPreferenceProfile(ctx),
  );

  r.route(
    {
      method: 'get',
      path: '/preferences/:namespace',
      summary: '获取偏好命名空间',
      request: { params: PreferenceNamespacePathSchema },
      responses: {
        200: successResponse(PreferenceNamespaceResponseSchema, '获取成功'),
        400: errorResponse('参数错误'),
      },
    },
    [auth],
    (req, ctx) => controller.getPreferenceNamespace(req.params!.namespace, ctx),
  );

  r.route(
    {
      method: 'patch',
      path: '/preferences/:namespace',
      summary: '更新偏好命名空间',
      request: {
        params: PreferenceNamespacePathSchema,
        body: { content: { 'application/json': { schema: PatchPreferenceNamespaceBodySchema } } },
      },
      responses: {
        200: successResponse(PreferenceMutationReceiptSchema, '更新成功'),
        400: errorResponse('参数错误'),
        409: errorResponse('偏好版本冲突'),
      },
    },
    [auth],
    (req, ctx) => controller.patchPreferenceNamespace(req.params!.namespace, req.body, ctx),
  );

  r.route(
    {
      method: 'post',
      path: '/preferences/:namespace/reset',
      summary: '重置偏好命名空间',
      request: {
        params: PreferenceNamespacePathSchema,
        body: { content: { 'application/json': { schema: ResetPreferenceNamespaceBodySchema } } },
      },
      responses: {
        200: successResponse(PreferenceMutationReceiptSchema, '重置成功'),
        400: errorResponse('参数错误'),
        409: errorResponse('偏好版本冲突'),
      },
    },
    [auth],
    (req, ctx) => controller.resetPreferenceNamespace(req.params!.namespace, req.body, ctx),
  );

  r.route(
    {
      method: 'post',
      path: '/preferences/reset-all',
      summary: '重置外观与区域偏好',
      request: {
        body: { content: { 'application/json': { schema: ResetUserPreferencesBodySchema } } },
      },
      responses: {
        200: successResponse(ResetUserPreferencesResponseSchema, '重置成功'),
        400: errorResponse('参数错误'),
      },
    },
    [auth],
    (req, ctx) => controller.resetUserPreferences(req.body, ctx),
  );

  // GET / — 获取用户设置
  r.route(
    {
      method: 'get',
      path: '/',
      summary: '获取用户设置',
      responses: {
        200: successResponse(UserSettingResponseSchema, '获取成功'),
      },
    },
    [auth],
    (_req, ctx) => controller.getUserSetting(ctx),
  );

  // PATCH /:category — 按分类更新用户设置
  r.route(
    {
      method: 'patch',
      path: '/:category',
      summary: '按分类更新用户设置',
      request: {
        body: { content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } } },
      },
      responses: {
        200: successResponse(UserSettingResponseSchema, '更新成功'),
        400: errorResponse('参数错误'),
      },
    },
    [auth],
    (req, ctx) =>
      controller.patchUserSetting(
        { category: req.params!.category as string, patch: req.body },
        ctx,
      ),
  );

  // POST /reset — 重置用户设置
  r.route(
    {
      method: 'post',
      path: '/reset',
      summary: '重置用户设置',
      request: {
        body: { content: { 'application/json': { schema: ResetUserSettingPublicSchema } } },
      },
      responses: {
        200: successResponse(UserSettingResponseSchema, '重置成功'),
      },
    },
    [auth],
    (req, ctx) => controller.resetUserSetting(req.body, ctx),
  );

  // POST /export — 导出设置
  r.route(
    {
      method: 'post',
      path: '/export',
      summary: '导出设置',
      request: { body: { content: { 'application/json': { schema: ExportSettingsSchema } } } },
      responses: {
        200: successResponse(ExportSettingsResponseSchema, '导出成功'),
      },
    },
    [auth],
    (req, ctx) => controller.exportSettings(req.body, ctx),
  );

  // POST /import — 导入设置
  r.route(
    {
      method: 'post',
      path: '/import',
      summary: '导入设置',
      request: { body: { content: { 'application/json': { schema: ImportSettingsSchema } } } },
      responses: {
        201: successResponse(ImportSettingsResponseSchema, '导入成功'),
        400: errorResponse('参数错误'),
      },
    },
    [auth],
    (req, ctx) => controller.importSettings(req.body, ctx),
    { successStatus: 201 },
  );

  // GET /defaults — 获取默认设置
  r.route(
    {
      method: 'get',
      path: '/defaults',
      summary: '获取默认设置',
      responses: {
        200: successResponse(UserSettingResponseSchema, '获取成功'),
      },
    },
    [auth],
    async () => controller.getDefaultSettings(),
  );

  return router;
}
