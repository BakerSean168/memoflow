/**
 * Server-state runtime policy (pilot values from plan §3.5).
 * 试点 server-state 运行时策略（计划 §3.5 的试点取值）。
 *
 * These values are pilot-only and are NOT promoted to repository-wide defaults until
 * ADR-045 accepts or rejects them after measurement.
 * 这些值是试点专用，在 ADR-045 实测接受/拒绝前不提升为全仓默认。
 */

/** Runtime lane: web HTTP vs desktop PowerSync/IPC. 运行时通道：Web HTTP 或 Desktop PowerSync/IPC。 */
export type RuntimeLane = 'web' | 'desktop';

/** Notification stale time: 30s. 通知 staleTime：30 秒。 */
export const NOTIFICATION_STALE_TIME_MS = 30_000;

/** Governance stale time: 30s. 治理规则 staleTime：30 秒。 */
export const GOVERNANCE_STALE_TIME_MS = 30_000;

/** Task template stale time: 60s. 任务模板 staleTime：60 秒。 */
export const TASK_TEMPLATE_STALE_TIME_MS = 60_000;

/** Garbage collection time: 10min, memory-only (never offline storage). 10 分钟，仅内存。 */
export const SERVER_STATE_GC_TIME_MS = 10 * 60_000;

/**
 * Resolved per-lane runtime policy.
 * 每个 lane 解析后的运行时策略。
 */
export interface ServerStateRuntimePolicy {
  lane: RuntimeLane;
  /** Per-module stale times (ms). 各模块 staleTime（毫秒）。 */
  staleTime: { notification: number; taskPlan: number; governance: number };
  /** Query cache GC time (ms). 查询缓存 gcTime（毫秒）。 */
  gcTime: number;
  /**
   * Query networkMode: web = 'online' (offline keeps existing data), desktop = 'always'
   * (IPC/local DB reads must work offline).
   * 查询 networkMode：Web='online'（离线保留已有数据）；Desktop='always'（IPC/local DB 可离线读）。
   */
  queryNetworkMode: 'online' | 'always';
  /**
   * Mutation networkMode is always 'always' with retry 0 so HTTP/IPC failures surface
   * immediately to onError/rollback (never a suspended speculative write).
   * mutation 恒定 'always' + retry 0，让网络失败立即进入 onError/rollback。
   */
  mutationNetworkMode: 'always';
  mutationRetry: number;
}

/**
 * Build the pilot runtime policy for a lane.
 * 为指定 lane 构建试点运行时策略。
 */
export function createServerStateRuntimePolicy(lane: RuntimeLane): ServerStateRuntimePolicy {
  return {
    lane,
    staleTime: {
      notification: NOTIFICATION_STALE_TIME_MS,
      taskPlan: TASK_TEMPLATE_STALE_TIME_MS,
      governance: GOVERNANCE_STALE_TIME_MS,
    },
    gcTime: SERVER_STATE_GC_TIME_MS,
    queryNetworkMode: lane === 'web' ? 'online' : 'always',
    mutationNetworkMode: 'always',
    mutationRetry: 0,
  };
}
