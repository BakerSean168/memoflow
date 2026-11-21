import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import {
  CompleteKnowledgeRepositoryInstallationResponseSchema,
  CreateKnowledgeRepositoryConnectionSchema,
  DisconnectKnowledgeRepositoryConnectionResponseSchema,
  KnowledgeRemoteBindingClientSchema,
  KnowledgeRepositoryInstallationIntentStatusResponseSchema,
  ListKnowledgeRepositoryConnectionsResSchema,
  StartKnowledgeRepositoryInstallationResponseSchema,
  KnowledgeNoteProjectionClientSchema,
  KnowledgeNoteProjectionListResponseSchema,
  ReferenceableKnowledgeDocumentListResponseSchema,
  KnowledgeNoteTreeResponseSchema,
  KnowledgeNoteLinkGraphResponseSchema,
  KnowledgeAttachmentContentResponseSchema,
  KnowledgeAttachmentProjectionListResponseSchema,
  ListKnowledgeWriteRequestsResSchema,
} from '@memoflow/repository-contracts';
import {
  OperationTimelineEntrySchema,
  OperationAuditRecordSchema,
} from '@memoflow/operations-contracts';
import { successResponse, errorResponse, RouteRegistrar } from '@memoflow/utils/result';
import type { RepositoryApplicationPort } from '../../server/application';
import { KnowledgeRepositoryConnectionController } from '../../server/transport/knowledge-repository-connection.controller';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  readonly requireEmailVerified?: RequestHandler;
}

const connectionParams = z.object({ connectionId: z.string().min(1) });
const installationSetupQuerySchema = z.object({
  state: z.string().min(16),
  installation_id: z.string().min(1),
  setup_action: z.enum(['install', 'update']).optional(),
});

function escapeInstallationSetupHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderInstallationSetupPage(message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MemoFlow GitHub setup</title></head><body><main><h1>MemoFlow</h1><p>${escapeInstallationSetupHtml(message)}</p></main></body></html>`;
}

/**
 * GitHub App installation and knowledge repository connection routes.
 * These routes are intentionally separate from authentication OAuth routes.
 */
export function registerKnowledgeRepositoryConnectionRoutes(
  api: RepositoryApplicationPort,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const controller = new KnowledgeRepositoryConnectionController(api);
  const auth: RequestHandler[] = middleware.requireEmailVerified
    ? [middleware.auth, middleware.requireEmailVerified]
    : [middleware.auth];
  router.get('/knowledge-connections/installations/setup', async (req, res) => {
    const parsed = installationSetupQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .type('html')
        .send(renderInstallationSetupPage('GitHub installation callback is invalid.'));
      return;
    }

    const result = await api.receiveGithubInstallationSetup({
      state: parsed.data.state,
      installationId: parsed.data.installation_id,
      setupAction: parsed.data.setup_action,
    });
    if (!result.ok) {
      const status =
        result.error.code === 'FORBIDDEN'
          ? 403
          : result.error.code === 'CONFLICT'
            ? 409
            : result.error.code === 'SERVICE_UNAVAILABLE'
              ? 503
              : 400;
      res.status(status).type('html').send(renderInstallationSetupPage(result.error.message));
      return;
    }

    if (result.data.kind === 'redirect' || result.data.kind === 'web') {
      res.redirect(302, result.data.location);
      return;
    }
    res
      .status(200)
      .type('html')
      .send(
        renderInstallationSetupPage(
          'GitHub knowledge repository access was recorded. You can return to MemoFlow Desktop.',
        ),
      );
  });

  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/repositories',
    defaultTags: ['Knowledge Repository'],
    defaultSecurity: [{ bearerAuth: [] }],
  });

  openApiRegistry?.registerPath({
    method: 'get',
    path: '/api/v1/repositories/knowledge-connections/installations/setup',
    tags: ['Knowledge Repository'],
    summary: '接收 GitHub App installation Setup URL 回调',
    description:
      '公开 GitHub redirect 边界；只记录已验证 installation callback 或路由到 allowlisted environment，不授予 repository connection 权限。',
    security: [],
    request: { query: installationSetupQuerySchema },
    responses: {
      200: { description: 'Desktop installation callback recorded; safe completion HTML' },
      302: { description: 'Safe redirect to configured environment API or Web return path' },
      400: { description: 'Invalid or expired installation state' },
      403: { description: 'Unknown environment route or forbidden installation' },
      409: { description: 'Installation state conflict' },
      503: { description: 'GitHub installation verification unavailable' },
    },
  });

  r.route(
    {
      method: 'post',
      path: '/webhooks/github',
      summary: '接收 GitHub push webhook',
      security: [],
      request: {
        body: { content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } } },
      },
      responses: {
        202: successResponse(
          z.object({
            accepted: z.boolean(),
            duplicate: z.boolean(),
            reason: z.string().optional(),
          }),
          'Webhook 已接收',
        ),
        401: errorResponse('Webhook 签名无效'),
        422: errorResponse('Webhook 参数错误'),
        503: errorResponse('GitHub App 未配置'),
      },
    },
    [],
    async (req, _ctx) => {
      const request = req as unknown as {
        headers?: Record<string, string | string[] | undefined>;
        body?: unknown;
        rawBody?: string;
      };
      const header = request.headers?.['x-hub-signature-256'];
      const deliveryHeader = request.headers?.['x-github-delivery'];
      const eventHeader = request.headers?.['x-github-event'];
      const signature = Array.isArray(header) ? header[0] : header;
      const deliveryId = Array.isArray(deliveryHeader) ? deliveryHeader[0] : deliveryHeader;
      const eventName = Array.isArray(eventHeader) ? eventHeader[0] : eventHeader;
      const rawBody = request.rawBody ?? JSON.stringify(request.body ?? {});
      return api.ingestGithubWebhook({
        deliveryId: deliveryId ?? '',
        eventName: eventName ?? '',
        signature: signature ?? '',
        rawBody,
      });
    },
    { successStatus: 202, requireAuth: false },
  );

  r.route(
    {
      method: 'post',
      path: '/knowledge-connections/installations/start',
      summary: '开始 GitHub App 安装',
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({ returnUrl: z.string().url().optional() }),
            },
          },
        },
      },
      responses: {
        200: successResponse(StartKnowledgeRepositoryInstallationResponseSchema, '安装链接已创建'),
        401: errorResponse('未授权，请登录'),
        422: errorResponse('参数错误'),
        503: errorResponse('GitHub App 未配置'),
      },
    },
    auth,
    (req, ctx) => controller.startInstallation(ctx, req.body),
  );

  r.route(
    {
      method: 'get',
      path: '/knowledge-notes/:projectionId/link-graph',
      summary: '读取 GitHub 知识笔记关系图',
      request: {
        params: z.object({ projectionId: z.string().min(1) }),
        query: z.object({ depth: z.string().optional(), maxNodes: z.string().optional() }),
      },
      responses: {
        200: successResponse(KnowledgeNoteLinkGraphResponseSchema, '获取成功'),
        401: errorResponse('未授权，请登录'),
        404: errorResponse('笔记不存在'),
        422: errorResponse('关系图参数错误'),
      },
    },
    auth,
    (req, ctx) => controller.getNoteLinkGraph(ctx, req.params?.projectionId ?? '', req.query),
  );

  r.route(
    {
      method: 'get',
      path: '/knowledge-notes',
      summary: '浏览 GitHub 知识笔记投影',
      request: {
        query: z.object({
          connectionId: z.string().optional(),
          query: z.string().optional(),
          cursor: z.string().optional(),
          includeHidden: z.enum(['true', 'false']).optional(),
          sort: z.enum(['path', 'recent']).optional(),
          limit: z.string().optional(),
        }),
      },
      responses: {
        200: successResponse(KnowledgeNoteProjectionListResponseSchema, '获取成功'),
        401: errorResponse('未授权，请登录'),
        503: errorResponse('知识投影暂不可用'),
      },
    },
    auth,
    (req, ctx) => controller.listNotes(ctx, req.query),
  );

  r.route(
    {
      method: 'get',
      path: '/knowledge-documents/referenceable',
      summary: '列出可稳定引用的知识文档',
      request: {
        query: z.object({
          query: z.string().optional(),
          cursor: z.string().optional(),
          limit: z.string().optional(),
        }),
      },
      responses: {
        200: successResponse(ReferenceableKnowledgeDocumentListResponseSchema, '获取成功'),
        401: errorResponse('未授权，请登录'),
        422: errorResponse('可引用知识文档参数错误'),
        503: errorResponse('知识投影暂不可用'),
      },
    },
    auth,
    (req, ctx) => controller.listReferenceableDocuments(ctx, req.query),
  );

  r.route(
    {
      method: 'get',
      path: '/knowledge-notes/tree',
      summary: '浏览 GitHub 知识笔记目录树',
      request: {
        query: z.object({
          connectionId: z.string().optional(),
          parent: z.string().optional(),
          includeHidden: z.enum(['true', 'false']).optional(),
        }),
      },
      responses: {
        200: successResponse(KnowledgeNoteTreeResponseSchema, '目录树已获取'),
        401: errorResponse('未授权，请登录'),
        422: errorResponse('目录树参数错误'),
        503: errorResponse('知识投影暂不可用'),
      },
    },
    auth,
    (req, ctx) => controller.listNoteTree(ctx, req.query),
  );

  r.route(
    {
      method: 'get',
      path: '/knowledge-notes/resolve',
      summary: '解析 GitHub 知识笔记引用',
      request: {
        query: z.object({
          connectionId: z.string().optional(),
          reference: z.string().min(1),
        }),
      },
      responses: {
        200: successResponse(KnowledgeNoteProjectionClientSchema, '笔记引用已解析'),
        401: errorResponse('未授权，请登录'),
        404: errorResponse('笔记不存在'),
        422: errorResponse('笔记引用参数错误'),
        503: errorResponse('知识投影暂不可用'),
      },
    },
    auth,
    (req, ctx) => controller.resolveNoteReference(ctx, req.query),
  );

  r.route(
    {
      method: 'get',
      path: '/knowledge-notes/:projectionId',
      summary: '读取 GitHub 知识笔记投影',
      request: { params: z.object({ projectionId: z.string().min(1) }) },
      responses: {
        200: successResponse(KnowledgeNoteProjectionClientSchema, '获取成功'),
        401: errorResponse('未授权，请登录'),
        404: errorResponse('笔记不存在'),
      },
    },
    auth,
    (req, ctx) => controller.getNote(ctx, req.params?.projectionId ?? ''),
  );

  r.route(
    {
      method: 'get',
      path: '/knowledge-attachments',
      summary: '浏览 GitHub 知识附件投影',
      request: {
        query: z.object({
          connectionId: z.string().optional(),
          query: z.string().optional(),
          limit: z.string().optional(),
        }),
      },
      responses: {
        200: successResponse(KnowledgeAttachmentProjectionListResponseSchema, '获取成功'),
        401: errorResponse('未授权，请登录'),
        503: errorResponse('附件投影暂不可用'),
      },
    },
    auth,
    (req, ctx) => controller.listAttachments(ctx, req.query),
  );

  r.route(
    {
      method: 'get',
      path: '/knowledge-attachments/:projectionId/content',
      summary: '受认证读取 GitHub 知识附件',
      description: '服务端按 attachment blob SHA 读取；响应不包含 GitHub installation token。',
      request: { params: z.object({ projectionId: z.string().min(1) }) },
      responses: {
        200: successResponse(KnowledgeAttachmentContentResponseSchema, '获取成功'),
        401: errorResponse('未授权，请登录'),
        403: errorResponse('仓库附件授权无效'),
        404: errorResponse('附件不存在'),
        409: errorResponse('附件投影已变化'),
        422: errorResponse('附件超过 10 MiB 上限'),
        503: errorResponse('GitHub 服务不可用'),
      },
    },
    auth,
    (req, ctx) => controller.getAttachmentContent(ctx, req.params?.projectionId ?? ''),
  );

  r.route(
    {
      method: 'get',
      path: '/knowledge-connections/installations/intents/:intentId',
      summary: '读取 GitHub App 安装意图状态',
      request: { params: z.object({ intentId: z.string().min(1) }) },
      responses: {
        200: successResponse(
          KnowledgeRepositoryInstallationIntentStatusResponseSchema,
          '安装状态已获取',
        ),
        401: errorResponse('未授权，请登录'),
        404: errorResponse('安装意图不存在'),
      },
    },
    auth,
    (req, ctx) => controller.getInstallationIntentStatus(ctx, req.params?.intentId ?? ''),
  );

  r.route(
    {
      method: 'post',
      path: '/knowledge-connections/installations/intents/:intentId/finalize',
      summary: '以当前 MemoFlow 身份确认 GitHub App 安装',
      request: { params: z.object({ intentId: z.string().min(1) }) },
      responses: {
        200: successResponse(CompleteKnowledgeRepositoryInstallationResponseSchema, '安装已确认'),
        401: errorResponse('未授权，请登录'),
        403: errorResponse('安装不属于当前身份'),
        404: errorResponse('安装意图不存在'),
        409: errorResponse('安装尚未回调或状态冲突'),
        503: errorResponse('GitHub 服务不可用'),
      },
    },
    auth,
    (req, ctx) => controller.finalizeInstallationIntent(ctx, req.params?.intentId ?? ''),
  );

  r.route(
    {
      method: 'post',
      path: '/knowledge-connections/installations/complete',
      summary: '完成 GitHub App 安装',
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({
                state: z.string().min(16),
                installationId: z.string().min(1),
                setupAction: z.enum(['install', 'update']).optional(),
              }),
            },
          },
        },
      },
      responses: {
        200: successResponse(CompleteKnowledgeRepositoryInstallationResponseSchema, '安装已验证'),
        401: errorResponse('未授权，请登录'),
        403: errorResponse('安装状态或权限无效'),
        422: errorResponse('参数错误'),
        503: errorResponse('GitHub 服务不可用'),
      },
    },
    auth,
    (req, ctx) => controller.completeInstallation(ctx, req.body),
  );

  r.route(
    {
      method: 'get',
      path: '/knowledge-connections',
      summary: '列出知识仓库连接',
      responses: {
        200: successResponse(ListKnowledgeRepositoryConnectionsResSchema, '获取成功'),
        401: errorResponse('未授权，请登录'),
        503: errorResponse('GitHub App 未配置'),
      },
    },
    auth,
    (_req, ctx) => controller.listConnections(ctx),
  );

  r.route(
    {
      method: 'post',
      path: '/knowledge-connections/:connectionId/refresh-observation',
      summary: '显式刷新 GitHub Provider observation',
      description:
        '重新检查 GitHub installation/repository 当前事实并只更新 observation；不会修改 binding lifecycle。',
      request: { params: connectionParams },
      responses: {
        200: successResponse(KnowledgeRemoteBindingClientSchema, 'Provider observation 已刷新'),
        401: errorResponse('未授权，请登录'),
        404: errorResponse('绑定不存在'),
        503: errorResponse('GitHub Provider 暂不可用'),
      },
    },
    auth,
    (req, ctx) => controller.refreshObservation(ctx, req.params),
  );

  r.route(
    {
      method: 'post',
      path: '/knowledge-connections',
      summary: '连接已授权的知识仓库',
      request: {
        body: {
          content: { 'application/json': { schema: CreateKnowledgeRepositoryConnectionSchema } },
        },
      },
      responses: {
        200: successResponse(KnowledgeRemoteBindingClientSchema, '连接成功'),
        401: errorResponse('未授权，请登录'),
        403: errorResponse('仓库权限不足'),
        404: errorResponse('仓库不存在'),
        409: errorResponse('仓库已被其他账号连接'),
        422: errorResponse('参数错误'),
        503: errorResponse('GitHub 服务不可用'),
      },
    },
    auth,
    (req, ctx) => controller.connect(ctx, req.body),
  );

  r.route(
    {
      method: 'delete',
      path: '/knowledge-connections/:connectionId',
      summary: '断开知识仓库连接',
      description:
        '默认仅撤销连接并保留可重建云端投影；purgeCloudData=true 才会永久删除云端派生数据。',
      request: {
        params: connectionParams,
        query: z.object({ purgeCloudData: z.enum(['true', 'false']).optional() }),
      },
      responses: {
        200: successResponse(DisconnectKnowledgeRepositoryConnectionResponseSchema, '已断开'),
        401: errorResponse('未授权，请登录'),
        404: errorResponse('连接不存在'),
      },
    },
    auth,
    (req, ctx) =>
      controller.disconnect(ctx, {
        ...req.params,
        purgeCloudData: req.query?.purgeCloudData === 'true',
      }),
  );

  r.route(
    {
      method: 'get',
      path: '/knowledge-write-requests',
      summary: '列出 Git commit 的 projection 操作状态',
      description:
        '返回 write-request 账本；Git commit 状态（status/commitSha）与 projection 操作状态（projectionStatus/投影错误/重试次数）分开，Committed 但投影 Pending/Failed 的写入仍可见。',
      request: {
        query: z.object({
          connectionId: z.string().min(1).optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
        }),
      },
      responses: {
        200: successResponse(ListKnowledgeWriteRequestsResSchema, '获取成功'),
        401: errorResponse('未授权，请登录'),
        503: errorResponse('知识写请求暂不可用'),
      },
    },
    auth,
    (req, ctx) => controller.listWriteRequests(ctx, req.query),
  );

  r.route(
    {
      method: 'get',
      path: '/operations/timeline',
      summary: '查询统一投影 operation timeline（W7）',
      responses: {
        200: successResponse(z.array(OperationTimelineEntrySchema), '获取成功'),
      },
    },
    auth,
    (_req, ctx) => controller.queryKnowledgeTimeline(ctx),
  );

  // GET /operations/audit — W7 actor-scoped audit trail
  r.route(
    {
      method: 'get',
      path: '/operations/audit',
      summary: '查询投影操作审计记录（W7，最小权限）',
      request: {
        query: z.object({
          source: z.string().optional(),
          operationId: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        }),
      },
      responses: {
        200: successResponse(z.array(OperationAuditRecordSchema), '获取成功'),
      },
    },
    auth,
    (req, ctx) => controller.getOperationAudit(ctx, req.query),
  );

  return router;
}
