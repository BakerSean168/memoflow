/**
 * Data Portability API Routes
 *
 * Routes:
 *   POST /export — 导出 V3 用户数据
 *   POST /server-held-data-disclosure — 导出不可导入的服务端持有数据披露
 *   POST /dry-run — 校验 V3 导入而不修改数据
 *   POST /apply — 应用 V3 导入
 */

import { Router } from 'express';
import type { RequestHandler } from 'express';
import {
  RouteRegistrar,
  type OpenApiRegistryLike,
  successResponse,
  errorResponse,
} from '@memoflow/utils/result';
import {
  ExportServerHeldDataDisclosureReqSchema,
  ExportServerHeldDataDisclosureResSchema,
  ExportPortableDataV3ReqSchema,
  PortableDataV3ImportReqSchema,
  ExportPortableDataV3ResSchema,
  PortableDataV3ImportResSchema,
} from '@memoflow/contracts/data-portability';
import { DataPortabilityController, ServerHeldDataDisclosureController } from '../server/transport';
import type {
  DataPortabilityApplicationPort,
  ServerHeldDataDisclosureApplicationPort,
} from '../server/application';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole(roles: string[]): RequestHandler;
}

export function registerDataPortabilityRoutes(
  api: DataPortabilityApplicationPort,
  disclosureApi: ServerHeldDataDisclosureApplicationPort,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const { auth } = middleware;
  const controller = new DataPortabilityController(api);
  const disclosureController = new ServerHeldDataDisclosureController(disclosureApi);

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/data-portability',
    defaultTags: ['DataPortability'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  r.route(
    {
      method: 'post',
      path: '/server-held-data-disclosure',
      summary: '导出不可导入的服务端持有数据披露',
      request: {
        body: {
          content: {
            'application/json': { schema: ExportServerHeldDataDisclosureReqSchema },
          },
        },
      },
      responses: {
        200: successResponse(ExportServerHeldDataDisclosureResSchema, '服务端持有数据披露导出成功'),
      },
    },
    [auth],
    (req, ctx) => disclosureController.exportServerHeldDataDisclosure(req.body, ctx),
  );

  r.route(
    {
      method: 'post',
      path: '/export',
      summary: '导出 V3 用户数据',
      request: { body: { content: { 'application/json': { schema: ExportPortableDataV3ReqSchema } } } },
      responses: {
        200: successResponse(ExportPortableDataV3ResSchema, 'V3 导出成功'),
      },
    },
    [auth],
    (req, ctx) => controller.exportPortableDataV3(req.body, ctx),
  );

  r.route(
    {
      method: 'post',
      path: '/dry-run',
      summary: '校验 V3 导入（不修改数据）',
      request: { body: { content: { 'application/json': { schema: PortableDataV3ImportReqSchema } } } },
      responses: {
        200: successResponse(PortableDataV3ImportResSchema, 'V3 导入校验成功'),
        400: errorResponse('参数错误'),
      },
    },
    [auth],
    (req, ctx) => controller.dryRunPortableDataV3(req.body, ctx),
  );

  r.route(
    {
      method: 'post',
      path: '/apply',
      summary: '应用 V3 导入',
      request: { body: { content: { 'application/json': { schema: PortableDataV3ImportReqSchema } } } },
      responses: {
        200: successResponse(PortableDataV3ImportResSchema, 'V3 导入成功'),
        400: errorResponse('参数错误'),
      },
    },
    [auth],
    (req, ctx) => controller.applyPortableDataV3(req.body, ctx),
  );

  return router;
}
