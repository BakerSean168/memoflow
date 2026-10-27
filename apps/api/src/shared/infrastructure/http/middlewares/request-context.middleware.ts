/**
 * Request Context Middleware
 * 请求上下文中间件
 *
 * RefArch Phase 2 + Phase 6: the single producer of canonical `RequestContext`
 * metadata and the single terminal settlement owner for every HTTP attempt. It
 * runs as the FIRST global `app.use`, before Helmet/CORS/body-parser/
 * compression, so every downstream response type (JSON, 204, auth failure, 404,
 * 500, SSE `flushHeaders()`) shares the same `X-Request-Id`, `traceId` and
 * `startedAt`.
 *
 * RefArch 阶段 2 + 阶段 6：每次 HTTP 请求统一请求元数据与唯一 terminal
 * settlement owner。它作为第一个全局 `app.use` 运行，早于 Helmet/CORS/body
 * 解析/compression，因此所有下游响应（JSON、204、鉴权失败、404、500、SSE
 * `flushHeaders()`）都共享同一个 `X-Request-Id`、`traceId` 与 `startedAt`。
 *
 * finish/close share one exactly-once guard: `finish` settles `finished`, a
 * later `close` is ignored; a `close` without `finish` (SSE disconnect, socket
 * drop) settles `aborted`. The injected observer drives the terminal log,
 * bounded metrics and (opt-in) trace span in one settlement, and observer
 * failures are isolated so they never change the response.
 *
 * finish/close 共享 exactly-once guard：`finish` 结算为 `finished`，其后的
 * `close` 被忽略；没有 `finish` 的 `close`（SSE 断开、socket 丢弃）结算为
 * `aborted`。注入的 observer 在一次结算中驱动 terminal log、有界 metrics 与
 * （opt-in）trace span，observer 失败被隔离，绝不改变响应。
 *
 * The middleware is identity-agnostic: it never reads Authorization/cookies and
 * never resolves a Principal. The Cloud Auth middleware parses the principal
 * later, and the Express adapter composes the full `ExecutionContext`.
 *
 * 本中间件与身份无关：不读取 Authorization/cookie，也不解析 Principal。
 * Cloud Auth 中间件在其后解析 principal，由 Express adapter 合成完整
 * `ExecutionContext`。
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { RequestContext } from '@memoflow/transport-contracts';
import { createLogger, type ILogger } from '@memoflow/utils/logger';
import {
  createHttpRequestLoggerObserver,
  resolveRouteTemplate,
  type HttpRequestObservation,
  type HttpRequestObserver,
  type HttpRequestOutcome,
} from '../../observability/http-request-observation';
import { NOOP_HTTP_REQUEST_TRACE } from '../../observability/noop-http-request-trace';
import type { HttpRequestTrace } from '../../observability/http-request-trace';

/**
 * Pattern for accepting a client/proxy-supplied `X-Request-Id`.
 * 接受 client/proxy 提供的 `X-Request-Id` 的匹配规则。
 *
 * Trimmed value must start with an alphanumeric char and continue with up to
 * 127 chars of `[A-Za-z0-9._:-]` (total max length 128).
 */
const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * Express Request augmented with the producer-owned carrier.
 * 携带 producer-owned carrier 的 Express Request 类型。
 *
 * `requestContext` is the single producer-owned carrier; downstream callers
 * (envelope, error handler, SSE routes) read `requestContext.*` only — there are
 * no deprecated projections.
 *
 * `requestContext` 是唯一 producer-owned carrier；下游调用方（envelope、error
 * handler、SSE 路由）只读取 `requestContext.*`，没有 deprecated 投影。
 */
export interface RequestContextCarrierRequest extends Request {
  /**
   * Canonical per-request metadata produced once by
   * `createRequestContextMiddleware`.
   * 由 `createRequestContextMiddleware` 生成一次的规范请求元数据。
   */
  requestContext: RequestContext;
}

/**
 * Options for `createRequestContextMiddleware`.
 * `createRequestContextMiddleware` 的选项。
 */
export interface RequestContextMiddlewareOptions {
  /**
   * Request ID factory. Defaults to `node:crypto` `randomUUID`.
   * 请求 ID 工厂，默认使用 `node:crypto` 的 `randomUUID`。
   */
  readonly idFactory?: () => string;
  /**
   * Clock used for `startedAt` and terminal durations. Defaults to `Date.now`.
   * Returns Unix epoch milliseconds.
   * 用于 `startedAt` 与 terminal 时长的时钟，默认 `Date.now`；返回 Unix epoch 毫秒。
   */
  readonly now?: () => number;
  /**
   * Structured logger used for observer-failure reporting and as the default
   * terminal logger. Defaults to a `RequestContext` logger.
   * 用于 observer 失败上报与默认 terminal logger 的结构化 logger，默认创建
   * `RequestContext` logger。
   */
  readonly logger?: ILogger;
  /**
   * Terminal observer that receives the single settlement observation.
   * Defaults to a logger observer writing the request-completed/aborted entry.
   * 接收唯一 settlement observation 的 terminal observer。默认使用写入
   * request-completed/aborted 条目的 logger observer。
   */
  readonly observer?: HttpRequestObserver;
  /**
   * Trace Port. Defaults to the shared noop trace: no SDK objects, no W3C
   * extraction, `traceId === requestId`. When OpenTelemetry is enabled the
   * SERVER span context stays active through `next()` so W3C headers can
   * propagate to internal calls.
   *
   * Trace Port。默认使用共享 noop trace：无 SDK 对象、无 W3C extraction、
   * `traceId === requestId`。启用 OpenTelemetry 时 SERVER span context 在
   * `next()` 期间保持 active，使 W3C headers 可透传到内部调用。
   */
  readonly trace?: HttpRequestTrace;
}

/**
 * Accepts a client-supplied request ID when it is a single string that, after
 * trimming, matches the allowlist. Everything else (missing, array/duplicate,
 * empty, whitespace/control chars, too long, non-ASCII) falls back to `null`
 * and the middleware generates a UUID instead — never a 400.
 *
 * 仅当 header 是单个字符串且 trim 后匹配 allowlist 时才接受；其它情况
 * （缺失、数组/重复、空、空白/控制字符、超长、非 ASCII）一律回退为 `null`
 * 并由中间件生成 UUID，绝不返回 400。
 *
 * @param value - Raw `x-request-id` header value.
 * @returns The accepted trimmed ID, or `null` to trigger UUID fallback.
 */
export function acceptClientRequestId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed !== value) return null;
  return CLIENT_REQUEST_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Creates the global RequestContext middleware.
 * 创建全局 RequestContext 中间件。
 *
 * @param options - Factory options (idFactory / clock / logger / observer) for
 *   testability.
 * @returns An Express request handler.
 */
export function createRequestContextMiddleware(
  options: RequestContextMiddlewareOptions = {},
): RequestHandler {
  const idFactory = options.idFactory ?? randomUUID;
  const now = options.now ?? Date.now;
  const logger = options.logger ?? createLogger('RequestContext');
  const observer = options.observer ?? createHttpRequestLoggerObserver(logger);
  const trace = options.trace ?? NOOP_HTTP_REQUEST_TRACE;

  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = acceptClientRequestId(req.headers['x-request-id']) ?? idFactory();
    const startedAt = now();
    const span = trace.startSpan(req);
    const requestContext: RequestContext = {
      requestId,
      // OTel disabled: traceId stays equal to requestId (ADR-045). Enabled:
      // the SERVER span provides a real trace ID.
      traceId: span.traceId ?? requestId,
      startedAt,
      source: 'http',
    };

    const request = req as RequestContextCarrierRequest;
    request.requestContext = requestContext;

    // Set before next() so every downstream response type echoes the same ID.
    res.setHeader('X-Request-Id', requestId);

    let settled = false;
    const settle = (outcome: HttpRequestOutcome): void => {
      if (settled) return;
      settled = true;

      const identityId = (req as { user?: { identityId?: string } }).user?.identityId;
      const observation: HttpRequestObservation = {
        requestId,
        traceId: requestContext.traceId,
        method: req.method,
        routeTemplate: resolveRouteTemplate(req),
        statusCode: res.statusCode,
        outcome,
        durationMs: now() - startedAt,
        ...(identityId ? { identityId } : {}),
      };

      try {
        observer.complete(observation);
      } catch (error) {
        logger.error('Request observer failed; response unaffected', error);
      }

      try {
        span.complete(observation);
      } catch (error) {
        logger.error('Request span failed; response unaffected', error);
      }
    };

    res.on('finish', () => settle('finished'));
    res.on('close', () => settle('aborted'));

    // With OTel enabled, the SERVER span context stays active through next() so
    // downstream async work (e.g. the AI internal HTTP call) inherits it and
    // W3C headers propagate. Noop keeps running in the ambient context.
    span.runWithContext(() => next());
  };
}
