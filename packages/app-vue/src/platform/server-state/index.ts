/**
 * Server-state platform module for the RefArch Phase 5 Query Cache pilots.
 * 参考架构阶段 5 Query Cache 试点的 server-state 平台模块。
 *
 * Root exports here are the host composition surface only (plan §3.6): feature query keys
 * and cache-patch helpers stay internal so TanStack internals do not leak into the
 * repository-wide public contract.
 * 此处 root exports 仅限 host 组合所需表面（§3.6）；feature keys 与 cache-patch helper 保持内部。
 */

export {
  createServerStateRuntime,
  createTestServerStateRuntime,
  installServerStateRuntime,
  useServerStateRuntime,
  useServerStateIdentityScope,
  SERVER_STATE_RUNTIME_KEY,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  type ServerStateRuntime,
  type InstallServerStateRuntimeOptions,
} from './runtime';
export {
  createServerStateRuntimePolicy,
  type RuntimeLane,
  type ServerStateRuntimePolicy,
} from './query-policy';
export {
  createServerStateInvalidationDispatcher,
  type ServerStateInvalidation,
  type ServerStateInvalidationDispatcher,
  type ServerStateInvalidationDispatcherOptions,
} from './invalidation-dispatcher';
export { createTestServerQueryClient, createServerQueryClient } from './query-client';
export { resultQueryFn, type ResultErrorException } from './result-query';
export type { CanonicalNotificationListQuery, CanonicalTaskPlanListQuery } from './query-keys';
