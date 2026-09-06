/**
 * Task template query cache patch helpers (module internal; plan §3.6).
 * Task template query cache 的 patch helper（模块内部，§3.6）。
 *
 * Only mutation lifecycles and instance projections call these; realtime adapters and
 * components never patch the cache directly. Snapshots are used for the §3.4 optimistic
 * update/status rollback contract (exact restore per key).
 * 只有 mutation lifecycle 与 instance projection 调用；实时适配器与组件绝不直接 patch cache。
 */

import { hashKey, type QueryClient, type QueryKey } from '@tanstack/vue-query';
import type { UpdateTaskTemplateReq } from '@memoflow/contracts/task';
import type { TaskTemplateClientDTO } from '@memoflow/contracts/task';
import { taskTemplateQueryKeys } from '../../../platform/server-state/query-keys';

/** Shape of a list data payload stored under a task-template list key. */
interface TemplateCollectionData {
  templates?: unknown[];
}

interface TemplateDetailData {
  id?: unknown;
}

function isCollectionData(data: unknown): data is TemplateCollectionData {
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as { templates?: unknown }).templates)
  );
}

function isDetailFor(data: unknown, id: string): data is TemplateDetailData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in (data as Record<string, unknown>) &&
    (data as { id: unknown }).id === id
  );
}

/**
 * Read a task template from the detail cache, falling back to any cached list.
 * 从 detail cache 读取模板；缺失时回退到任意已缓存的 list。
 */
export function getTaskTemplateFromCache(
  queryClient: QueryClient,
  identityScope: string,
  id: string,
): TaskTemplateClientDTO | undefined {
  const detail = queryClient.getQueryData<TaskTemplateClientDTO>(
    taskTemplateQueryKeys.detail(identityScope, id),
  );
  if (detail) return detail;
  const entries = queryClient.getQueriesData<unknown>({
    queryKey: taskTemplateQueryKeys.identity(identityScope),
  });
  for (const [, data] of entries) {
    if (!isCollectionData(data)) continue;
    const found = (data.templates as TaskTemplateClientDTO[]).find((t) => t.id === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Patch every cached list entry + detail for a task template.
 * 用 server-confirmed DTO patch 所有已缓存 list 条目与 detail。
 */
export function patchTaskTemplateEverywhere(
  queryClient: QueryClient,
  identityScope: string,
  template: TaskTemplateClientDTO,
): void {
  const entries = queryClient.getQueriesData<unknown>({
    queryKey: taskTemplateQueryKeys.identity(identityScope),
  });
  for (const [queryKey, data] of entries) {
    if (!data) continue;
    if (isCollectionData(data)) {
      queryClient.setQueryData(queryKey, {
        ...data,
        templates: (data.templates as TaskTemplateClientDTO[]).map((t) =>
          t.id === template.id ? template : t,
        ),
      });
    } else if (isDetailFor(data, template.id)) {
      queryClient.setQueryData(queryKey, template);
    }
  }
  queryClient.setQueryData<TaskTemplateClientDTO>(
    taskTemplateQueryKeys.detail(identityScope, template.id),
    template,
  );
}

/**
 * Remove a server-confirmed deleted task template from every cached list + detail.
 * 从所有已缓存 list 与 detail 中移除 server-confirmed 删除的模板。
 */
export function removeTaskTemplateFromCache(
  queryClient: QueryClient,
  identityScope: string,
  id: string,
): void {
  const entries = queryClient.getQueriesData<unknown>({
    queryKey: taskTemplateQueryKeys.identity(identityScope),
  });
  for (const [queryKey, data] of entries) {
    if (!data) continue;
    if (isCollectionData(data)) {
      queryClient.setQueryData(queryKey, {
        ...data,
        templates: (data.templates as TaskTemplateClientDTO[]).filter((t) => t.id !== id),
      });
    } else if (isDetailFor(data, id)) {
      queryClient.removeQueries({ queryKey });
    }
  }
  queryClient.removeQueries({ queryKey: taskTemplateQueryKeys.detail(identityScope, id) });
}

/**
 * Snapshot every matching query under the identity (for optimistic rollback).
 * 快照 identity 下所有匹配 query（用于 optimistic rollback）。
 *
 * Besides the data per key, it records which keys already existed so an optimistic
 * patch that creates a brand-new detail entry can be rolled back residue-free (§P1-1).
 * 除逐 key 数据外，还记录快照时已存在的 key，使得 optimistic patch 新建的 detail 条目
 * 能在回滚时被无残留地移除（P1-1）。
 */
export interface TaskTemplateCacheSnapshot {
  /** Data captured per existing key. 每个已存在 key 的数据。 */
  entries: Array<[QueryKey, unknown]>;
  /** hashKey set of the keys that existed at snapshot time. 快照时已存在 key 的 hashKey 集合。 */
  existingKeys: Set<string>;
}

export function snapshotTaskTemplateCache(
  queryClient: QueryClient,
  identityScope: string,
): TaskTemplateCacheSnapshot {
  const entries = queryClient.getQueriesData<unknown>({
    queryKey: taskTemplateQueryKeys.identity(identityScope),
  });
  return {
    entries,
    existingKeys: new Set(entries.map(([queryKey]) => hashKey(queryKey))),
  };
}

/**
 * Exactly restore a snapshot taken by `snapshotTaskTemplateCache` (per-key), then remove
 * any key created by the optimistic patch that did not exist at snapshot time.
 * 逐 key 精确恢复 `snapshotTaskTemplateCache` 快照，再移除 optimistic patch 新建（快照时
 * 不存在）的 key，保证回滚无残留。
 */
export function restoreTaskTemplateSnapshot(
  queryClient: QueryClient,
  identityScope: string,
  snapshot: TaskTemplateCacheSnapshot,
): void {
  for (const [queryKey, data] of snapshot.entries) {
    if (data === undefined) {
      queryClient.removeQueries({ queryKey });
    } else {
      queryClient.setQueryData(queryKey, data);
    }
  }
  // Remove newly-created keys (e.g. a detail key the optimistic patch introduced).
  // 移除快照中不存在的、由 optimistic patch 新建的 key。
  const current = queryClient.getQueriesData<unknown>({
    queryKey: taskTemplateQueryKeys.identity(identityScope),
  });
  for (const [queryKey] of current) {
    if (!snapshot.existingKeys.has(hashKey(queryKey))) {
      queryClient.removeQueries({ queryKey });
    }
  }
}

/**
 * Map `UpdateTaskTemplateReq` fields onto a DTO patch (optimistic merge). Values keep the
 * transport req shape (e.g. `TaskTimeConfigReq` vs DTO `TaskTimeConfigDTO`); the merge in
 * `mergeTaskTemplateUpdate` casts back to the DTO so the cache stays a plain projection.
 * 把 `UpdateTaskTemplateReq` 字段映射为 DTO patch（optimistic 合并）。
 */
export function mapUpdateToDtoPatch(req: UpdateTaskTemplateReq): Record<string, unknown> {
  return {
    ...(req.name !== undefined ? { name: req.name } : {}),
    ...(req.description !== undefined ? { description: req.description } : {}),
    ...(req.importance !== undefined ? { importance: req.importance } : {}),
    ...(req.tags !== undefined ? { tags: [...req.tags] } : {}),
    ...(req.color !== undefined ? { color: req.color } : {}),
    ...(req.goalBinding !== undefined ? { goalBinding: req.goalBinding } : {}),
    ...(req.timeConfig !== undefined ? { timeConfig: req.timeConfig } : {}),
    ...(req.recurrenceRule !== undefined ? { recurrenceRule: req.recurrenceRule } : {}),
    ...(req.reminderConfig !== undefined ? { reminderConfig: req.reminderConfig } : {}),
  };
}

/**
 * Build an optimistic template by merging an update request into the cached entry.
 * 通过把 update request 合并进已缓存条目构造 optimistic 模板（无缓存时返回 undefined）。
 */
export function mergeTaskTemplateUpdate(
  queryClient: QueryClient,
  identityScope: string,
  id: string,
  req: UpdateTaskTemplateReq,
): TaskTemplateClientDTO | undefined {
  const cached = getTaskTemplateFromCache(queryClient, identityScope, id);
  if (!cached) return undefined;
  return {
    ...cached,
    ...(mapUpdateToDtoPatch(req) as Partial<TaskTemplateClientDTO>),
    version: cached.version + 1,
    updatedAt: Date.now(),
  };
}

/**
 * Wait until a query key reaches a terminal state (`success` or `error`), or is removed.
 * Resolves on success and on error/removal so imperative facade callers never hang.
 * Unsubscribes in every terminal path.
 * 等待指定 query key 进入终态（`success`/`error`）或被移除；成功或失败/移除都会 resolve，
 * 保证命令式 facade 调用方不会永久挂起；每个终态路径都会取消订阅。
 */
export function waitForTaskTemplateQuery(
  queryClient: QueryClient,
  queryKey: QueryKey,
): Promise<void> {
  const state = queryClient.getQueryState(queryKey);
  if (state) {
    if (state.status === 'success' || state.status === 'error') {
      return Promise.resolve();
    }
  }
  return new Promise((resolve) => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (hashKey(event.query.queryKey) !== hashKey(queryKey)) return;
      if (event.type === 'removed') {
        unsubscribe();
        resolve();
        return;
      }
      if (
        event.type === 'updated' &&
        (event.query.state.status === 'success' || event.query.state.status === 'error')
      ) {
        unsubscribe();
        resolve();
      }
    });
  });
}
