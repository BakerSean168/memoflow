import { createHttpResponseBuilder } from '@memoflow/transport-contracts/result';
import type { RequestContext } from '@memoflow/transport-contracts';

/**
 * Builds an HttpResponse envelope for one HTTP attempt.
 * 为单次 HTTP 请求构建 HttpResponse envelope。
 *
 * RefArch Phase 2: the producer-owned carrier (`req.requestContext`) is the
 * single source of `traceId`/`startedAt`. There are no fallback projections.
 *
 * RefArch 阶段 2：`req.requestContext` 是 `traceId`/`startedAt` 的唯一来源，
 * 没有兼容回退投影。
 */
export function createApiResponseBuilder(req?: unknown) {
  const request = req && typeof req === 'object' ? (req as Record<string, unknown>) : {};
  const requestContext =
    request.requestContext && typeof request.requestContext === 'object'
      ? (request.requestContext as RequestContext)
      : undefined;

  return createHttpResponseBuilder({
    traceId: requestContext?.traceId,
    startTime: requestContext?.startedAt ?? Date.now(),
  });
}
