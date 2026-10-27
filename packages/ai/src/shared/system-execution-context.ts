/**
 * System execution context for background AI runtime calls that have no
 * user-facing HTTP/IPC transport (event subscribers, cron, agent tools).
 * 为无 HTTP/IPC transport 的 AI 后台 runtime 调用（事件订阅、cron、agent 工具）
 * 构造 system execution context。
 *
 * Each invocation gets a fresh, independent request ID by default (never reused
 * as a durable run/proposal/checkpoint key). Nested calls that already carry an
 * entry correlation ID (e.g. agent tools invoked inside a parent request) may
 * pass it in so the Python AI service can correlate the whole chain.
 * 默认每次调用生成独立的新 request ID（绝不当作持久 run/proposal/checkpoint key）。
 * 已携带入口 correlation ID 的嵌套调用（如父请求内的 agent 工具）可传入该 ID，
 * 使 Python AI service 能关联整条调用链。
 */

import { randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@memoflow/transport-contracts';

/**
 * Builds a canonical `source: 'system'` `ExecutionContext`.
 * 构造 canonical `source: 'system'` 的 `ExecutionContext`。
 *
 * @param identityId - The resolved owner identity for the background call.
 * @param requestId - Optional entry correlation request ID to propagate for nested
 *                    calls; when omitted a fresh UUID is minted.
 * @returns A full `ExecutionContext` with a fresh (or propagated) request ID.
 */
export function createSystemExecutionContext(
  identityId: string,
  requestId?: string,
): ExecutionContext {
  const resolvedRequestId = requestId ?? randomUUID();
  return {
    requestId: resolvedRequestId,
    traceId: resolvedRequestId,
    startedAt: Date.now(),
    source: 'system',
    identityId,
  };
}
