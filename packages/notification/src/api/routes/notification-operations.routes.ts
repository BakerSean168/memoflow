/**
 * Notification Operations Routes — 死信、投递回执、统一操作时间线与审计
 *
 * 由 `routes.ts` 聚合入口调用：`RouteRegistrar` 与 operations controller 均由
 * 入口构造一次后传入，本文件只负责逐条注册路由与 OpenAPI 元数据。
 */

import { z } from 'zod';
import type { RequestHandler } from 'express';
import { type RouteRegistrar, successResponse, errorResponse } from '@memoflow/utils/result';
import { parseNumber, parseString } from '@memoflow/utils/shared';
import { ReplayDeadLetterInvocationSchema } from '@memoflow/notification-contracts';
import { BusinessOperationReceiptSchema } from '@memoflow/reliable-messaging-contracts';
import {
  OperationAuditRecordSchema,
  OperationTimelineEntrySchema,
} from '@memoflow/operations-contracts';
import type { NotificationOperationsController } from '../../server/transport/notification-operations.controller';

export interface NotificationOperationsRouteDeps {
  readonly operationsController: NotificationOperationsController;
  readonly auth: RequestHandler;
}

export function registerNotificationOperationsRoutes(
  r: RouteRegistrar,
  { operationsController, auth }: NotificationOperationsRouteDeps,
): void {
  // GET /dead-letters — operations-only identity-scoped query
  r.route(
    {
      method: 'get',
      path: '/dead-letters',
      summary: '查询死信通知队列',
      responses: {
        200: successResponse(z.array(BusinessOperationReceiptSchema), '获取成功'),
      },
    },
    [auth],
    (_req, ctx) => operationsController.queryDeadLetters(ctx),
  );

  // POST /dead-letters/:id/replay — Identity-scoped dead-letter replay
  r.routeWithValidation(
    {
      method: 'post',
      path: '/dead-letters/:id/replay',
      summary: '重发死信通知',
      request: { params: ReplayDeadLetterInvocationSchema.shape.params },
      responses: {
        200: successResponse(BusinessOperationReceiptSchema, '重发成功'),
        404: errorResponse('死信通知不存在'),
      },
      validation: {
        schema: ReplayDeadLetterInvocationSchema,
        projectInput: (req) => ({ params: req.params }),
      },
    },
    [auth],
    (data, ctx) => operationsController.replayDeadLetter(data.params.id, ctx),
  );

  // GET /receipts — Delivery receipt timeline query
  r.route(
    {
      method: 'get',
      path: '/receipts',
      summary: '查询通知投递回执时间线',
      responses: {
        200: successResponse(z.array(BusinessOperationReceiptSchema), '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      operationsController.getDeliveryReceipts(ctx, {
        limit: parseNumber(req.query?.limit),
        lastCursor: parseString(req.query?.lastCursor ?? req.query?.since),
        since: parseString(req.query?.since),
        status: parseString(req.query?.status),
      }),
  );

  // GET /operations/timeline — W7 unified operation timeline (identity-scoped)
  r.route(
    {
      method: 'get',
      path: '/operations/timeline',
      summary: '查询统一操作时间线（W7）',
      responses: {
        200: successResponse(z.array(OperationTimelineEntrySchema), '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      operationsController.getOperationTimeline(ctx, {
        status: parseString(req.query?.status),
        limit: parseNumber(req.query?.limit),
      }),
  );

  // GET /operations/audit — W7 audit trail (actor-scoped, least privilege)
  r.route(
    {
      method: 'get',
      path: '/operations/audit',
      summary: '查询操作审计记录（W7，最小权限）',
      responses: {
        200: successResponse(z.array(OperationAuditRecordSchema), '获取成功'),
      },
    },
    [auth],
    (req, ctx) =>
      operationsController.getOperationAudit(ctx, {
        source: parseString(req.query?.source),
        operationId: parseString(req.query?.operationId),
        limit: parseNumber(req.query?.limit),
      }),
  );
}
