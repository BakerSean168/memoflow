/**
 * Shared Express execution-context extractor for custom AI routes (SSE etc.)
 * that cannot be wrapped by `expressAdapter`.
 * 供无法被 `expressAdapter` 包裹的自定义 AI 路由（如 SSE）使用的共享
 * Express execution-context extractor。
 *
 * It composes the producer-owned `req.requestContext` carrier with the
 * auth-resolved `req.user.identityId`. When the global RequestContext
 * middleware did not run (standalone mounts), the shared reader mints a
 * canonical-shaped fallback carrier; identity scoping still fails closed on its
 * own (missing identity → 401).
 *
 * 该 extractor 把 producer-owned `req.requestContext` carrier 与
 * auth-resolved `req.user.identityId` 合成完整 context。全局 RequestContext
 * middleware 未运行时（独立挂载），共享 reader 生成 canonical-shaped fallback
 * carrier；identity 作用域仍然自行 fail closed（缺失 identity → 401）。
 *
 * The composer is the SAME `defaultExtractContext` exported by
 * `@memoflow/utils/result` — custom AI routes reuse the canonical extractor
 * instead of defining a second one.
 */

import type { ExecutionContext, RequestContext } from '@memoflow/transport-contracts';
import { defaultExtractContext, readExpressRequestContext } from '@memoflow/utils/result';

/**
 * Express-like request shape consumed by the shared extractor.
 * 共享 extractor 消费的 Express-like request shape。
 */
export interface AiExpressRequestLike {
  /** Producer-owned canonical request metadata (RequestContext middleware). */
  requestContext?: RequestContext;
  /** Auth-resolved principal representation (`req.user`). */
  user?: { identityId?: string };
}

function asRequestLike(req: unknown): AiExpressRequestLike {
  return (req ?? {}) as AiExpressRequestLike;
}

/**
 * Reads the producer-owned carrier via the shared Express reader
 * (`readExpressRequestContext`), which mints a canonical-shaped fallback when
 * the global RequestContext middleware was not mounted.
 * 通过共享 Express reader（`readExpressRequestContext`）读取 producer-owned
 * carrier；未挂载全局 RequestContext middleware 时生成 canonical-shaped 回退值。
 *
 * Accepts a real Express `Request` (or a structural equivalent in tests).
 */
export function readAiExpressRequestContext(req: unknown): RequestContext {
  return readExpressRequestContext(
    asRequestLike(req) as Parameters<typeof readExpressRequestContext>[0],
  );
}

/**
 * Composes the canonical `ExecutionContext` for a custom AI route.
 * 为自定义 AI 路由合成 canonical `ExecutionContext`。
 *
 * Delegates to the single shared Express composer (`defaultExtractContext` from
 * `@memoflow/utils/result`); the principal identity comes from `req.user`
 * (parsed once by the auth middleware). When absent the route is expected to
 * reject with 401 itself.
 *
 * @param req - The Express request (or a structural equivalent in tests).
 * @returns A full `ExecutionContext` (carrier + identity + device metadata).
 */
export function extractAiExpressExecutionContext(req: unknown): ExecutionContext {
  return defaultExtractContext(req as Parameters<typeof defaultExtractContext>[0]);
}

/**
 * Reads the envelope trace/start for a custom AI route from the canonical
 * carrier, so SSE/auth-error envelopes share the entry request ID.
 * 从 canonical carrier 读取自定义 AI 路由的 envelope trace/start，使
 * SSE/鉴权错误 envelope 与入口 request ID 一致。
 *
 * @param req - The Express request (or a structural equivalent in tests).
 */
export function readAiExpressEnvelopeMeta(req: unknown): {
  traceId?: string;
  startTime?: number;
} {
  const requestContext = readAiExpressRequestContext(req);
  return {
    traceId: requestContext.traceId,
    startTime: requestContext.startedAt,
  };
}
