/**
 * Global Middleware Configuration
 *
 * 将原 app.ts 中散落的全局中间件提取为独立模块，
 * 由 ApiBootstrapper 在启动时统一调用。
 *
 * RefArch Phase 6: the single request-context/observation middleware drives the
 * terminal log, bounded metrics and trace in one settlement. The previous
 * response-monkey-patching performance middleware is retired with
 * `X-Response-Time`.
 *
 * RefArch 阶段 6：唯一 request-context/observation middleware 在一次结算中
 * 驱动 terminal log、有界 metrics 与 trace。原先 monkey-patch 响应对象的
 * performance middleware 随 `X-Response-Time` 一起退役。
 */

import type { Express, Request } from 'express';
import cors from 'cors';
import { createLogger } from '@memoflow/utils/logger';
import { createExternalAgentEdgeAudit } from '../observability/external-agent-edge-audit';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { createRequestContextMiddleware } from '../http/middlewares/request-context.middleware';
import {
  createHttpRequestLoggerObserver,
  createObserverFanout,
} from '../observability/http-request-observation';
import type { HttpRequestMetricsRecorder } from '../observability/http-request-metrics';
import type { HttpRequestTrace } from '../observability/http-request-trace';
import { getCorsOrigins, isAllCorsOriginsAllowed, env } from '../config/env.js';
import {
  getTrustedWebOrigins,
  shouldDisableCrossOriginOpenerPolicyForLocalValidation,
} from '../config/web-origin.js';

export class CorsRejectionError extends Error {
  constructor(readonly origin?: string) {
    super('Not allowed by CORS');
    this.name = 'CorsRejectionError';
  }
}

/**
 * 应用所有全局中间件
 *
 * 包含：RequestContext/observation、Helmet、JSON 解析、Cookie 解析、CORS、
 * Compression。RequestContext 必须位于第一个 `app.use`：它在 auth/route/error
 * handler 之前建立 requestId/traceId/startedAt/source，并先写 `X-Request-Id`
 * 响应头，同时是 terminal log/metrics/span 的唯一结算点。
 */
export function applyGlobalMiddleware(
  app: Express,
  metricsRecorder: HttpRequestMetricsRecorder,
  options: {
    readonly beforeBodyParsing?: (app: Express) => void;
    readonly trace?: HttpRequestTrace;
  } = {},
): void {
  const allowedOrigins = getTrustedWebOrigins(getCorsOrigins(), env.MEMOFLOW_WEB_URL);
  const allowAllOrigins = isAllCorsOriginsAllowed();

  // Request metadata producer + single terminal observer (logger + metrics).
  // It must be the very first middleware so JSON, 204, auth failures, 404, 500
  // and SSE responses share one X-Request-Id and exactly one settlement.
  app.use(
    createRequestContextMiddleware({
      observer: createObserverFanout([createHttpRequestLoggerObserver(), metricsRecorder]),
      trace: options.trace,
    }),
  );

  if (env.EAG_READ_PILOT_ENABLED) {
    const auditLogger = createLogger('ExternalAgentEdgeAudit');
    auditLogger.setLevel('info');
    app.use(createExternalAgentEdgeAudit((event) => auditLogger.info('External agent audit', { ...event })));
  }

  // Security. Controlled HTTP local-validation origins (for example Tailscale
  // MagicDNS) are not potentially trustworthy in Chromium. COOP is inert there
  // and Chromium reports it as a console error, so disable only that header in
  // the narrow local-validation HTTP lane while preserving Helmet defaults for
  // production HTTPS and loopback development.
  const disableCrossOriginOpenerPolicy = shouldDisableCrossOriginOpenerPolicyForLocalValidation(
    env.AUTH_BASE_URL,
    env.LOCAL_VALIDATION,
  );
  app.use(helmet(disableCrossOriginOpenerPolicy ? { crossOriginOpenerPolicy: false } : undefined));

  // Body parsing
  app.use(cookieParser());

  // CORS
  app.use(
    cors({
      origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
        if (!origin) return callback(null, true);
        if (allowAllOrigins) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new CorsRejectionError(origin));
      },
      credentials: !allowAllOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Skip-Auth',
        'Cache-Control',
        'X-Request-Id',
        'MCP-Protocol-Version',
        'Mcp-Method',
        'Mcp-Name',
        // W3C trace headers for the opt-in OpenTelemetry lane (never HMAC/internal).
        'traceparent',
        'tracestate',
      ],
      // Expose the correlation header (never auth/internal HMAC headers).
      exposedHeaders: ['X-Request-Id'],
      maxAge: 86400,
    }),
  );

  options.beforeBodyParsing?.(app);

  // Hosted MCP has its own hard request budget, before the general API parser.
  app.use(
    '/mcp',
    (req, _res, next) => {
      req.setTimeout(30000);
      next();
    },
    express.json({ limit: '256kb' }),
  );

  // JSON body parsing (must be after CORS for preflight)
  app.use(
    express.json({
      limit: '2mb',
      verify(req, _res, buffer) {
        // GitHub signs the exact JSON bytes. Keep them only for signed webhook
        // requests so normal API traffic does not retain a second body copy.
        if (req.headers['x-hub-signature-256']) {
          (req as Request & { rawBody?: string }).rawBody = buffer.toString('utf8');
        }
      },
    }),
  );

  // Compression (skip SSE paths)
  app.use(
    compression({
      filter: (req, res) => {
        if (req.path.includes('/sse/')) {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );
}

// Re-export express for use in applyGlobalMiddleware
import express from 'express';
