/**
 * Query key scheme for the RefArch Phase 5 server-state pilots.
 * 参考架构阶段 5 试点 server-state 的查询键方案。
 *
 * Frozen by `docs/plan/active/2026-08-15-refarch-phase5-query-cache-pilot.md` §3.2:
 * - keys are identity-scoped (`identityScope`); the runtime lane is intentionally NOT
 *   part of the key because Web/Desktop each own a separate QueryClient.
 * - canonical query objects materialize pagination defaults, drop `undefined`, keep only
 *   transport-accepted primitive fields, and normalize arrays (copy/dedupe/sort).
 * - `identityScope` only isolates the cache; it is never written back to the request body.
 *
 * Module internal (not part of the host composition surface).
 */

import type { QueryKey } from '@tanstack/vue-query';
import type { RuleSeverity, RuleStatus } from '@memoflow/contracts/governance';

// ─── Notification ─────────────────────────────────────────────────────────────

/**
 * Canonical, transport-safe Notification list query used inside the cache key.
 * 进入 cache key 的规范化通知列表查询（仅 transport 接受的 primitive 字段）。
 *
 * Field order is frozen: `page/limit/type/isRead/startDate/endDate`.
 * 字段顺序冻结为：`page/limit/type/isRead/startDate/endDate`。
 */
export interface CanonicalNotificationListQuery {
  page: number;
  limit: number;
  type?: string;
  isRead?: boolean;
  startDate?: string;
  endDate?: string;
}

/** Input accepted by the Notification canonicalizer (may omit defaults/undefined). */
export type NotificationListQueryInput = Partial<CanonicalNotificationListQuery>;

/**
 * Materialize a Notification list query into its canonical, key-safe form.
 * 把通知列表查询规范化为键安全形态：补齐分页默认值、删除 undefined、按冻结字段顺序排列。
 */
export function canonicalizeNotificationListQuery(
  query?: NotificationListQueryInput,
): CanonicalNotificationListQuery {
  const { page, limit, type, isRead, startDate, endDate } = query ?? {};
  return {
    page: page ?? 1,
    limit: limit ?? 20,
    ...(type !== undefined ? { type } : {}),
    ...(isRead !== undefined ? { isRead } : {}),
    ...(startDate !== undefined ? { startDate: String(startDate) } : {}),
    ...(endDate !== undefined ? { endDate: String(endDate) } : {}),
  };
}

/**
 * Frozen Notification query key factories.
 * 冻结的 Notification 查询键工厂（§3.2）。
 */
export const notificationQueryKeys = {
  all: ['server-state', 'notification'] as const,
  identity: (identityScope: string) => [...notificationQueryKeys.all, identityScope] as const,
  lists: (identityScope: string) =>
    [...notificationQueryKeys.identity(identityScope), 'list'] as const,
  list: (identityScope: string, query: CanonicalNotificationListQuery) =>
    [...notificationQueryKeys.lists(identityScope), query] as const,
  details: (identityScope: string) =>
    [...notificationQueryKeys.identity(identityScope), 'detail'] as const,
  detail: (identityScope: string, id: string) =>
    [...notificationQueryKeys.details(identityScope), id] as const,
  unread: (identityScope: string) =>
    [...notificationQueryKeys.identity(identityScope), 'unread-count'] as const,
};

// ─── Task template ────────────────────────────────────────────────────────────

/**
 * Canonical, transport-safe Task template list query used inside the cache key.
 * 进入 cache key 的规范化任务模板列表查询（仅 transport 接受的 primitive 字段）。
 *
 * Field order is frozen: `page/limit/status/goalId/labelIdsAll`.
 * 字段顺序冻结为：`page/limit/status/goalId/labelIdsAll`。
 */
export interface CanonicalTaskTemplateListQuery {
  page: number;
  limit: number;
  status?: string[];
  goalId?: string;
  labelIdsAll?: string[];
}

/** Input accepted by the Task canonicalizer (may omit defaults/undefined). */
export type TaskTemplateListQueryInput = Partial<CanonicalTaskTemplateListQuery>;

/**
 * Normalize a string array for the cache key (copy, dedupe, sort).
 * 规范化字符串数组用于 cache key（拷贝、去重、排序）。
 */
function normalizeStringArray(value: string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const unique = [...new Set(value)].sort();
  return unique.length > 0 ? unique : undefined;
}

/**
 * Materialize a Task template list query into its canonical, key-safe form.
 * 把任务模板列表查询规范化为键安全形态：补齐分页默认值、规范化 status/labelIdsAll 数组、删除空字段。
 */
export function canonicalizeTaskTemplateListQuery(
  query?: TaskTemplateListQueryInput,
): CanonicalTaskTemplateListQuery {
  const { page, limit, status, goalId, labelIdsAll } = query ?? {};
  const normalizedStatus = normalizeStringArray(status);
  const normalizedLabelIds = normalizeStringArray(labelIdsAll);
  return {
    page: page ?? 1,
    limit: limit ?? 20,
    ...(normalizedStatus !== undefined ? { status: normalizedStatus } : {}),
    ...(goalId !== undefined ? { goalId } : {}),
    ...(normalizedLabelIds !== undefined ? { labelIdsAll: normalizedLabelIds } : {}),
  };
}

/**
 * Frozen Task template query key factories.
 * 冻结的 Task template 查询键工厂（§3.2）。
 */
export const taskTemplateQueryKeys = {
  all: ['server-state', 'task-template'] as const,
  identity: (identityScope: string) => [...taskTemplateQueryKeys.all, identityScope] as const,
  lists: (identityScope: string) =>
    [...taskTemplateQueryKeys.identity(identityScope), 'list'] as const,
  list: (identityScope: string, query: CanonicalTaskTemplateListQuery) =>
    [...taskTemplateQueryKeys.lists(identityScope), query] as const,
  details: (identityScope: string) =>
    [...taskTemplateQueryKeys.identity(identityScope), 'detail'] as const,
  detail: (identityScope: string, id: string) =>
    [...taskTemplateQueryKeys.details(identityScope), id] as const,
};

// ─── Governance ───────────────────────────────────────────────────────────────

/**
 * Canonical, transport-safe Governance rule list query used inside the cache key.
 * 进入 cache key 的规范化治理规则列表查询（仅 transport 接受的 primitive 字段）。
 *
 * Field order is frozen: `page/pageSize/status/severity/tags/search`.
 * 字段顺序冻结为：`page/pageSize/status/severity/tags/search`。
 */
export interface CanonicalGovernanceListQuery {
  page: number;
  pageSize: number;
  status?: RuleStatus;
  severity?: RuleSeverity;
  tags?: string[];
  search?: string;
}

/** Input accepted by the Governance canonicalizer (may omit defaults/undefined). */
export type GovernanceListQueryInput = Partial<CanonicalGovernanceListQuery>;

/**
 * Materialize a Governance rule list query into its canonical, key-safe form.
 * 把治理规则列表查询规范化为键安全形态：补齐分页默认值、删除 undefined、规范化 tags 数组。
 */
export function canonicalizeGovernanceListQuery(
  query?: GovernanceListQueryInput,
): CanonicalGovernanceListQuery {
  const { page, pageSize, status, severity, tags, search } = query ?? {};
  const normalizedTags = normalizeStringArray(tags);
  return {
    page: page ?? 1,
    pageSize: pageSize ?? 20,
    ...(status !== undefined ? { status } : {}),
    ...(severity !== undefined ? { severity } : {}),
    ...(normalizedTags !== undefined ? { tags: normalizedTags } : {}),
    ...(search !== undefined && search.length > 0 ? { search } : {}),
  };
}

/**
 * Frozen Governance query key factories.
 * 冻结的 Governance 查询键工厂。
 */
export const governanceQueryKeys = {
  all: ['server-state', 'governance'] as const,
  identity: (identityScope: string) => [...governanceQueryKeys.all, identityScope] as const,
  lists: (identityScope: string) =>
    [...governanceQueryKeys.identity(identityScope), 'list'] as const,
  list: (identityScope: string, query: CanonicalGovernanceListQuery) =>
    [...governanceQueryKeys.lists(identityScope), query] as const,
  details: (identityScope: string) =>
    [...governanceQueryKeys.identity(identityScope), 'detail'] as const,
  detail: (identityScope: string, id: string) =>
    [...governanceQueryKeys.details(identityScope), id] as const,
  revisions: (identityScope: string, ruleId: string) =>
    [...governanceQueryKeys.identity(identityScope), 'revision', ruleId] as const,
};

/** Type alias so the frozen key shape stays importable for dispatcher typing. */
export type NotificationQueryKeys = typeof notificationQueryKeys;
export type TaskTemplateQueryKeys = typeof taskTemplateQueryKeys;
export type GovernanceQueryKeys = typeof governanceQueryKeys;

/** Type guard for identity-scoped pilot query keys. */
export function isServerStateQueryKey(key: QueryKey | readonly unknown[]): boolean {
  return (
    key.length >= 2 &&
    key[0] === 'server-state' &&
    (key[1] === 'notification' || key[1] === 'task-template' || key[1] === 'governance')
  );
}
