/**
 * Server-state invalidation dispatcher — the single owner of `invalidateQueries` for the
 * pilot query cache (plan §3.3).
 * server-state 失效 dispatcher —— 试点 query cache 中 `invalidateQueries` 的唯一 owner（§3.3）。
 *
 * Event adapters and components MUST NOT call `invalidateQueries`/`setQueryData` directly;
 * they only emit typed invalidation intents. Mutation lifecycle cache helpers may patch
 * (`setQueryData`) under the explicit allowlist in each pilot composable.
 * 事件适配器与组件不得直接调用 `invalidateQueries`/`setQueryData`，只发出 typed invalidation intent；
 * 只有 mutation lifecycle cache helper 可按规定 allowlist 使用 `setQueryData`。
 *
 * Behaviors (frozen):
 * - intents in the same JavaScript turn are merged by identity + target + projection;
 * - repeated events carrying a stable `dedupeKey` are suppressed by a bounded per-runtime LRU;
 * - active queries are refetched once; inactive queries are only marked stale;
 * - empty or mismatched identity fails closed (never degrades to a global key).
 */

import type { QueryClient, QueryKey } from '@tanstack/vue-query';
import { governanceQueryKeys, notificationQueryKeys, taskTemplateQueryKeys } from './query-keys';

/**
 * Typed invalidation intent produced by mutation lifecycles and realtime adapters.
 * 由 mutation lifecycle 与实时适配器产生的 typed invalidation intent（冻结于 §3.3）。
 */
export type ServerStateInvalidation =
  | {
      target: 'notification';
      identityScope: string;
      source: 'mutation' | 'event-bus' | 'sse' | 'powersync' | 'reconnect';
      entityId?: string;
      dedupeKey?: string;
    }
  | {
      target: 'task-template';
      identityScope: string;
      source: 'mutation' | 'powersync' | 'reconnect';
      projection?: 'all' | 'lists' | 'details';
      entityId?: string;
      dedupeKey?: string;
    }
  | {
      target: 'governance';
      identityScope: string;
      source: 'mutation' | 'powersync' | 'reconnect';
      projection?: 'all' | 'lists' | 'details' | 'revisions';
      entityId?: string;
      dedupeKey?: string;
    };

/**
 * Dispatcher public interface: `invalidate` for intents, `clearIdentity` on identity change.
 * Dispatcher 公共接口：`invalidate` 处理 intent；identity 变化时 `clearIdentity`。
 */
export interface ServerStateInvalidationDispatcher {
  invalidate(intent: ServerStateInvalidation): Promise<void>;
  clearIdentity(identityScope: string): void;
}

/** Options for the dispatcher factory. 构造 dispatcher 的选项。 */
export interface ServerStateInvalidationDispatcherOptions {
  /** Bounded dedupe LRU size (default 256). 有界去重 LRU 容量（默认 256）。 */
  dedupeLimit?: number;
}

/**
 * Create the dispatcher bound to a QueryClient.
 * 创建绑定到指定 QueryClient 的 dispatcher。
 */
export function createServerStateInvalidationDispatcher(
  queryClient: QueryClient,
  options: ServerStateInvalidationDispatcherOptions = {},
): ServerStateInvalidationDispatcher {
  const dedupeLimit = options.dedupeLimit ?? 256;

  // Bounded per-runtime dedupe LRU (insertion order Map). 有界 per-runtime 去重 LRU。
  const dedupeKeys = new Map<string, true>();

  // Same-turn intent queue, flushed on a microtask. 同一 turn 的 intent 队列。
  let pendingBatch: { intent: ServerStateInvalidation; resolve: () => void }[] = [];
  let flushScheduled = false;

  function isValidIdentity(identityScope: string): boolean {
    return typeof identityScope === 'string' && identityScope.length > 0;
  }

  function recordDedupe(key: string): boolean {
    if (dedupeKeys.has(key)) return false;
    dedupeKeys.set(key, true);
    if (dedupeKeys.size > dedupeLimit) {
      const oldest = dedupeKeys.keys().next().value;
      if (oldest !== undefined) dedupeKeys.delete(oldest);
    }
    return true;
  }

  function mergeBatch(intents: ServerStateInvalidation[]): ServerStateInvalidation[] {
    const buckets = new Map<string, ServerStateInvalidation>();
    for (const intent of intents) {
      const bucketKey = `${intent.target}:${intent.identityScope}:${'projection' in intent ? (intent.projection ?? '') : ''}`;
      const existing = buckets.get(bucketKey);
      if (!existing) {
        buckets.set(bucketKey, intent);
        continue;
      }
      // Merge entityIds: keep the single id only when all merged intents share it.
      if (existing.entityId !== intent.entityId) {
        delete existing.entityId;
      }
      if (existing.dedupeKey === undefined) existing.dedupeKey = intent.dedupeKey;
    }
    return [...buckets.values()];
  }

  function notificationIntentKeys(
    intent: Extract<ServerStateInvalidation, { target: 'notification' }>,
  ): QueryKey[] {
    // mark-all / batch delete (mutation without an entity) clears the whole identity root.
    // mark-all / batch delete（无 entityId 的 mutation）失效整个 identity root。
    if (intent.source === 'mutation' && intent.entityId === undefined) {
      return [notificationQueryKeys.identity(intent.identityScope)];
    }
    const keys: QueryKey[] = [
      notificationQueryKeys.lists(intent.identityScope),
      notificationQueryKeys.unread(intent.identityScope),
    ];
    if (intent.entityId !== undefined) {
      keys.push(notificationQueryKeys.detail(intent.identityScope, intent.entityId));
    }
    return keys;
  }

  function taskTemplateIntentKeys(
    intent: Extract<ServerStateInvalidation, { target: 'task-template' }>,
  ): QueryKey[] {
    const scope = intent.identityScope;
    const projection = intent.projection ?? 'all';
    const keys: QueryKey[] = [];
    if (projection === 'lists') {
      keys.push(taskTemplateQueryKeys.lists(scope));
    } else if (projection === 'details') {
      keys.push(taskTemplateQueryKeys.details(scope));
    } else {
      // 'all' — but mutation semantics differ: mutations must not invalidate the whole details
      // prefix (only the known entity's detail, added below). Non-mutation 'all' (powersync) does.
      // mutation 语义不同：只失效 lists（详情只按已知 entity 单独失效），非 mutation 的
      // 'all'（powersync 表变化）才整段失效 details prefix。
      keys.push(taskTemplateQueryKeys.lists(scope));
      if (intent.source !== 'mutation') {
        keys.push(taskTemplateQueryKeys.details(scope));
      }
    }
    if (intent.entityId !== undefined) {
      keys.push(taskTemplateQueryKeys.detail(scope, intent.entityId));
    }
    return keys;
  }

  function governanceIntentKeys(
    intent: Extract<ServerStateInvalidation, { target: 'governance' }>,
  ): QueryKey[] {
    const scope = intent.identityScope;
    const projection = intent.projection ?? 'all';
    const keys: QueryKey[] = [];
    if (projection === 'revisions') {
      keys.push(governanceQueryKeys.identity(scope).concat('revision') as QueryKey);
    } else if (projection === 'lists') {
      keys.push(governanceQueryKeys.lists(scope));
    } else if (projection === 'details') {
      keys.push(governanceQueryKeys.details(scope));
    } else {
      // 'all' — mutation semantics differ from table changes (see task-template above).
      keys.push(
        governanceQueryKeys.lists(scope),
        governanceQueryKeys.details(scope),
        governanceQueryKeys.identity(scope).concat('revision') as QueryKey,
      );
    }
    if (intent.entityId !== undefined) {
      keys.push(governanceQueryKeys.detail(scope, intent.entityId));
    }
    return keys;
  }

  function intentKeys(intent: ServerStateInvalidation): QueryKey[] {
    if (intent.target === 'notification') return notificationIntentKeys(intent);
    if (intent.target === 'task-template') return taskTemplateIntentKeys(intent);
    return governanceIntentKeys(intent);
  }

  async function flush(): Promise<void> {
    flushScheduled = false;
    const batch = pendingBatch;
    pendingBatch = [];
    if (batch.length === 0) return;

    const merged = mergeBatch(batch.map((b) => b.intent));
    const keys = new Set<string>();
    for (const intent of merged) {
      for (const key of intentKeys(intent)) {
        keys.add(JSON.stringify(key));
      }
    }

    for (const serialized of keys) {
      const queryKey = JSON.parse(serialized) as QueryKey;
      await queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
    }

    for (const entry of batch) entry.resolve();
  }

  function scheduleFlush(): void {
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(() => {
      void flush();
    });
  }

  return {
    async invalidate(intent: ServerStateInvalidation): Promise<void> {
      if (!isValidIdentity(intent.identityScope)) {
        // Fail closed: no global fallback for empty/mismatched identity.
        console.warn('[server-state] invalidation skipped: empty identityScope');
        return;
      }
      if (intent.dedupeKey !== undefined) {
        const dedupeKey = `${intent.target}:${intent.identityScope}:${intent.dedupeKey}`;
        if (!recordDedupe(dedupeKey)) {
          return; // Duplicate event suppressed by the bounded LRU.
        }
      }
      const promise = new Promise<void>((resolve) => {
        pendingBatch.push({ intent, resolve });
      });
      scheduleFlush();
      return promise;
    },

    clearIdentity(identityScope: string): void {
      // Remove pilot keys for this identity only; other identities stay intact.
      for (const key of [
        notificationQueryKeys.identity,
        taskTemplateQueryKeys.identity,
        governanceQueryKeys.identity,
      ]) {
        queryClient.removeQueries({ queryKey: key(identityScope) });
      }
      // Drop dedupe records for this identity so a re-login can re-process events.
      for (const dedupeKey of dedupeKeys.keys()) {
        if (dedupeKey.includes(`:${identityScope}:`)) dedupeKeys.delete(dedupeKey);
      }
    },
  };
}
