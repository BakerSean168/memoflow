/**
 * Express Adapter
 *
 * 将 Controller 函数适配为 Express 路由处理器。
 * 统一处理上下文提取、错误处理和响应格式化。
 *
 * RefArch Phase 2: the adapter is a pure consumer of the producer-owned
 * `req.requestContext` carrier. It composes the canonical `ExecutionContext`
 * (carrier + Principal + device metadata) at the adapter seam. When the global
 * RequestContext middleware was NOT mounted (standalone route mounts in tests /
 * second hosts), the default extractor mints a canonical-shaped fallback carrier
 * so unrelated routes keep working; the explicit identity-scoped paths (auth
 * middleware, SSE scoping) still fail closed on their own.
 *
 * Two variants:
 *   - `expressAdapter`                 — Controller receives raw (req, ctx)
 *   - `expressAdapterWithValidation`  — Validates req.body via Zod schema first
 *
 * @module @memoflow/utils/result/express-adapter
 *
 * @example
 * ```ts
 * import { expressAdapter, expressAdapterWithValidation } from '@memoflow/utils/result';
 *
 * // Controller handles validation internally
 * router.post('/', auth, expressAdapter(
 *   (req, ctx) => controller.create(req.body, ctx),
 *   { successStatus: 201 },
 * ));
 *
 * // Adapter validates body first, then passes parsed data to controller
 * router.post('/', auth, expressAdapterWithValidation(schema,
 *   (data, ctx, req) => controller.create(data, ctx),
 *   { successStatus: 201 },
 * ));
 * ```
 */

import {
  extractStructuredResultError,
  type Result,
  isOk,
  errorCodeToHttpStatus,
  getHttpStatusCode,
  publicFailureToHttpStatus,
  createHttpResponseBuilder,
} from '@memoflow/transport-contracts/result';
import type { ExecutionContext, RequestContext } from '@memoflow/transport-contracts';
import { mapPrismaError } from '../errors/prisma-error-mapper';
import { generateUUID } from '../shared/uuid';
// Residual 945: formatZodErrors dual retired — sole body in format-zod-errors.
import { formatZodErrors } from './format-zod-errors';
export { formatZodErrors };

// ============================================================================
// Types
// ============================================================================

/**
 * Express-like Request interface (avoid hard Express dependency).
 * 与 Express Request 兼容的接口（避免硬依赖 Express）。
 */
export interface ExpressLikeRequest {
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  user?: {
    identityId?: string;
    sessionId?: string;
    tokenType?: string;
    exp?: number;
  };
  /**
   * Producer-owned canonical request metadata set by the RequestContext
   * middleware. When present it is used as-is. When absent (standalone route
   * mounts) the default extractor mints a canonical-shaped fallback.
   * 由 RequestContext middleware 写入的 producer-owned 请求元数据；存在时直接
   * 使用，缺失时（独立挂载路由）默认 extractor 生成 canonical-shaped 回退值。
   */
  requestContext?: RequestContext;
  /**
   * Legacy fallbacks, read ONLY when `requestContext` is absent. Kept so
   * standalone mounts without the global middleware keep the same traceId /
   * startedAt they previously relied on.
   * 仅当 `requestContext` 缺失时才读取的 legacy 回退值；用于未挂载全局
   * middleware 的独立挂载，保持原有 traceId / startedAt。
   */
  id?: string;
  traceId?: string;
  startTime?: number;
}

/**
 * Express-like Response interface (avoid hard Express dependency)
 */
interface ExpressLikeResponse {
  status(code: number): this;
  json(data: unknown): this;
  /** Used for 204 No Content success responses (no JSON body). */
  end?(): this;
}

/**
 * Options for the Express adapter
 */
export interface ExpressAdapterOptions {
  /** HTTP status code for successful responses (default: 200) */
  successStatus?: number;
  /**
   * Custom context extractor. Must return a full `ExecutionContext`; partial
   * shapes are rejected by the type system. When omitted, the default extractor
   * composes the carrier + Principal + device metadata, minting a fallback
   * carrier when the global middleware was not mounted.
   * 自定义 context extractor，必须返回完整 `ExecutionContext`；省略时默认
   * extractor 合成 carrier + Principal + device 元数据，缺失 carrier 时
   * 生成 fallback carrier。
   */
  extractContext?: (req: ExpressLikeRequest) => ExecutionContext;
  /** Whether to require authentication (default: true) */
  requireAuth?: boolean;
}

/**
 * Options for the validation-aware Express adapter.
 *
 * Adds an optional input projector. Body-only callers keep the existing
 * shorthand (validate `req.body`); composite routes validate one named schema
 * over the projected input (e.g. `{ params, query, body }` composed into the
 * contract request shape). The projector is a pure wire adapter and must not
 * contain schema or business logic.
 *
 * 验证型 Express adapter 的选项。新增可选输入 projector：仅 body 的调用方
 * 保持旧 shorthand（直接校验 `req.body`）；复合路由用一个命名 schema 校验
 * 投影后的输入（例如把 `{ params, query, body }` 组合成 contract 请求形状）。
 * projector 是纯 wire 适配，不得包含 schema 或业务逻辑。
 */
export interface ExpressAdapterValidationOptions extends ExpressAdapterOptions {
  /**
   * Projects the Express request into the canonical contract input validated by
   * the schema. When omitted, `req.body` is validated (existing shorthand).
   * 将 Express 请求投影为 schema 校验的 canonical 输入；省略时校验 `req.body`
   * （保持旧 shorthand）。
   */
  projectInput?: (req: ExpressLikeRequest) => unknown;
}

// ============================================================================
// Default Helpers
// ============================================================================

/**
 * Reads the producer-owned carrier. When present it is returned as-is. When the
 * global RequestContext middleware was not mounted (standalone route mounts in
 * tests / second hosts), a canonical-shaped fallback carrier is minted so
 * unrelated routes do not crash; identity scoping still fails closed on its own
 * (missing `req.user.identityId` → 401).
 * 读取 producer-owned carrier。存在时原样返回；未挂载全局 RequestContext
 * middleware（独立挂载路由）时生成 canonical-shaped fallback carrier，避免
 * 无关路由崩溃；identity 作用域仍然自行 fail closed（缺失 identity → 401）。
 */
export function readExpressRequestContext(req: ExpressLikeRequest): RequestContext {
  const requestContext = req.requestContext;
  if (requestContext) {
    return requestContext;
  }
  const requestId = req.traceId ?? req.id ?? generateUUID();
  return {
    requestId,
    traceId: requestId,
    startedAt: req.startTime ?? Date.now(),
    source: 'http',
  };
}

/**
 * Residual 1183 keep-boundary: Express defaultExtractContext — canonical carrier
 * composer. Reads the producer-owned requestContext + header/body device info +
 * req.user.identityId into a full ExecutionContext. No identity-only stub.
 *
 * Exported so custom-AI SSE routes and other second-host transports reuse the
 * exact same composer instead of defining a second one.
 */
export function defaultExtractContext(req: ExpressLikeRequest): ExecutionContext {
  const requestContext = readExpressRequestContext(req);
  const headers = req.headers ?? {};
  const userAgentHeader = headers['user-agent'];
  const userAgent = Array.isArray(userAgentHeader)
    ? userAgentHeader[0]
    : typeof userAgentHeader === 'string'
      ? userAgentHeader
      : undefined;
  const forwarded = headers['x-forwarded-for'];
  const realIp = headers['x-real-ip'];
  const ipFromForwarded = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : undefined;
  const ipAddress =
    ipFromForwarded ||
    (Array.isArray(realIp) ? realIp[0] : typeof realIp === 'string' ? realIp : undefined) ||
    null;

  const body = (req.body ?? {}) as {
    deviceId?: string;
    deviceInfo?: {
      deviceId?: string;
      deviceName?: string | null;
      platform?: string | null;
      os?: string | null;
      browser?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
      deviceType?: string;
      deviceFingerprint?: string;
    };
    ipAddress?: string;
  };

  const deviceInfo = body.deviceInfo;
  const deviceId =
    (typeof headers['x-device-id'] === 'string' && headers['x-device-id']) ||
    body.deviceId ||
    deviceInfo?.deviceId ||
    'unknown';

  const ua = deviceInfo?.userAgent || userAgent || null;
  const platform = deviceInfo?.platform || deviceInfo?.os || null;
  const browser = deviceInfo?.browser || null;
  const deviceType = deviceInfo?.deviceType || inferDeviceType(ua);
  const deviceName =
    deviceInfo?.deviceName ||
    (platform || browser ? `${platform ?? 'Unknown'} - ${browser ?? 'Unknown'}` : null);

  return {
    ...requestContext,
    identityId: req.user?.identityId ?? '',
    deviceId,
    device: {
      deviceName,
      os: platform,
      browser,
      ipAddress: deviceInfo?.ipAddress || body.ipAddress || ipAddress,
      userAgent: ua,
      deviceType,
      deviceFingerprint: deviceInfo?.deviceFingerprint || undefined,
    },
  };
}

function inferDeviceType(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Browser';
  const ua = userAgent.toLowerCase();
  if (ua.includes('electron')) return 'Desktop';
  if (ua.includes('ipad') || ua.includes('tablet')) return 'Tablet';
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'Mobile';
  return 'Browser';
}

// ============================================================================
// Express Adapters
// ============================================================================

/**
 * Adapt a controller function to an Express route handler.
 *
 * Use this for routes that do NOT need body validation (GET, DELETE, etc.),
 * or when validation is handled inside the controller.
 *
 * The controller receives the full request object and the extracted context.
 *
 * @example
 * ```ts
 * router.get('/:id', auth, expressAdapter(
 *   (req, ctx) => handlers.getGoal.execute(req.params.id),
 * ));
 *
 * router.delete('/:id', auth, expressAdapter(
 *   (req, ctx) => handlers.deleteGoal.execute(req.params.id),
 * ));
 * ```
 */
export function expressAdapter<T>(
  controllerFn: (req: ExpressLikeRequest, context: ExecutionContext) => Promise<Result<T>>,
  options: ExpressAdapterOptions = {},
): (req: ExpressLikeRequest, res: ExpressLikeResponse) => Promise<void> {
  const {
    successStatus = 200,
    extractContext = defaultExtractContext,
    requireAuth = true,
  } = options;

  return async (req: ExpressLikeRequest, res: ExpressLikeResponse) => {
    // Resolve the context through the (possibly custom) extractor FIRST so a
    // second-host path without the global carrier still works. Envelope
    // metadata comes from the resulting canonical context — never from a
    // separate read that bypasses a custom extractor.
    const context = extractContext(req);
    const responseBuilder = createHttpResponseBuilder({
      traceId: context.traceId,
      startTime: context.startedAt,
    });

    try {
      // Auth check
      if (requireAuth && !req.user?.identityId) {
        res.status(401).json(responseBuilder.unauthorized());
        return;
      }

      const result = await controllerFn(req, context);

      if (isOk(result)) {
        // HTTP 204 must not carry a JSON body (residual 108 void dual-track).
        if (successStatus === 204) {
          res.status(204);
          if (typeof res.end === 'function') {
            res.end();
          }
          return;
        }
        res.status(successStatus).json(responseBuilder.success(result.data as T));
      } else {
        const status = getHttpStatusCode(result);
        res.status(status).json(responseBuilder.fromResult(result));
      }
    } catch (err) {
      const structuredError = extractStructuredResultError(err);
      if (structuredError) {
        const status =
          structuredError.statusCode ??
          (structuredError.failure
            ? publicFailureToHttpStatus(structuredError.failure)
            : errorCodeToHttpStatus(structuredError.code));
        res
          .status(status)
          .json(
            responseBuilder.error(
              structuredError.code,
              structuredError.message,
              structuredError.details,
              structuredError.context,
              structuredError.failure,
            ),
          );
        return;
      }

      // 2. Prisma errors — map to safe generic messages
      const prismaMapping = err instanceof Error ? mapPrismaError(err) : null;
      if (prismaMapping) {
        res
          .status(prismaMapping.httpStatus)
          .json(responseBuilder.error(prismaMapping.resultCode, prismaMapping.message));
        return;
      }

      // 3. Everything else — never leak internal details
      // Log the full error server-side for debugging (never sent to client)
      console.error(
        '[expressAdapter] Unhandled error:',
        err instanceof Error ? (err.stack ?? err.message) : err,
      );
      res.status(500).json(responseBuilder.internalError('Internal server error'));
    }
  };
}

// ============================================================================
// Express Adapter with Validation
// ============================================================================

/**
 * Zod-like schema interface (avoid hard Zod dependency)
 */
interface ZodLikeSchema<T> {
  safeParse(
    data: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
}

/**
 * Adapt a controller function to an Express route handler with upfront Zod validation.
 *
 * The adapter validates the projected input (default: `req.body`) against the
 * schema first, then calls the controller with (parsedData, context, req). If
 * validation fails, it responds with 400 and never calls the controller. An
 * optional `projectInput` option composes `{ params, query, body }` into a
 * named contract schema for composite routes.
 *
 * 验证型 Express adapter：先校验投影输入（默认 `req.body`），再以
 * (parsedData, context, req) 调用 controller；校验失败返回 400 且不调用
 * controller。可选 `projectInput` 把 `{ params, query, body }` 组合成
 * 复合路由的命名 contract schema 输入。
 *
 * @example
 * ```ts
 * router.post('/', auth, expressAdapterWithValidation(CreateGoalSchema,
 *   (data, ctx, req) => controller.create(data, ctx),
 *   { successStatus: 201 },
 * ));
 * ```
 */
export function expressAdapterWithValidation<TInput, TOutput>(
  schema: ZodLikeSchema<TInput>,
  controllerFn: (
    data: TInput,
    context: ExecutionContext,
    req: ExpressLikeRequest,
  ) => Promise<Result<TOutput>>,
  options: ExpressAdapterValidationOptions = {},
): (req: ExpressLikeRequest, res: ExpressLikeResponse) => Promise<void> {
  const {
    successStatus = 200,
    extractContext = defaultExtractContext,
    requireAuth = true,
    projectInput,
  } = options;

  return async (req: ExpressLikeRequest, res: ExpressLikeResponse) => {
    // Resolve the context through the (possibly custom) extractor FIRST so a
    // second-host path without the global carrier still works. Envelope
    // metadata comes from the resulting canonical context — never from a
    // separate read that bypasses a custom extractor.
    const context = extractContext(req);
    const responseBuilder = createHttpResponseBuilder({
      traceId: context.traceId,
      startTime: context.startedAt,
    });

    try {
      // Auth check
      if (requireAuth && !req.user?.identityId) {
        res.status(401).json(responseBuilder.unauthorized());
        return;
      }

      // Validate the projected input (default: req.body — existing shorthand)
      const input = projectInput ? projectInput(req) : req.body;
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        const details = formatZodErrors(parsed.error.issues);
        res.status(400).json(responseBuilder.validationError(details));
        return;
      }

      const result = await controllerFn(parsed.data, context, req);

      if (isOk(result)) {
        // HTTP 204 must not carry a JSON body (residual 108 void dual-track).
        if (successStatus === 204) {
          res.status(204);
          if (typeof res.end === 'function') {
            res.end();
          }
          return;
        }
        res.status(successStatus).json(responseBuilder.success(result.data as TOutput));
      } else {
        const status = getHttpStatusCode(result);
        res.status(status).json(responseBuilder.fromResult(result));
      }
    } catch (err) {
      const structuredError = extractStructuredResultError(err);
      if (structuredError) {
        const status =
          structuredError.statusCode ??
          (structuredError.failure
            ? publicFailureToHttpStatus(structuredError.failure)
            : errorCodeToHttpStatus(structuredError.code));
        res
          .status(status)
          .json(
            responseBuilder.error(
              structuredError.code,
              structuredError.message,
              structuredError.details,
              structuredError.context,
              structuredError.failure,
            ),
          );
        return;
      }

      // 2. Prisma errors — map to safe generic messages
      const prismaMapping = err instanceof Error ? mapPrismaError(err) : null;
      if (prismaMapping) {
        res
          .status(prismaMapping.httpStatus)
          .json(responseBuilder.error(prismaMapping.resultCode, prismaMapping.message));
        return;
      }

      // 3. Everything else — never leak internal details
      // Log the full error server-side for debugging (never sent to client)
      console.error(
        '[expressAdapterWithValidation] Unhandled error:',
        err instanceof Error ? (err.stack ?? err.message) : err,
      );
      res.status(500).json(responseBuilder.internalError('Internal server error'));
    }
  };
}
