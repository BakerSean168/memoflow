/**
 * Desktop renderer server-state runtime holder + PowerSync bridge mapping.
 *
 * Creates and installs the renderer-owned Query Cache runtime (lane: desktop PowerSync/IPC)
 * and keeps a single instance so logout / profile lock handlers can clear the identity cache.
 * Pilot table → invalidation intent mapping is centralized here (plan §3.3, Step 3).
 */

import type { App } from 'vue';
import {
  installServerStateRuntime,
  useAccountStore,
  type ServerStateInvalidation,
  type ServerStateRuntime,
} from '@memoflow/app-vue';

let currentRuntime: ServerStateRuntime | null = null;
let sources: Array<{ stop: () => void }> = [];
let disposed = false;
let pendingStartupCancel: (() => void) | null = null;

/** Create + install the desktop server-state runtime and remember it. */
export function installDesktopServerStateRuntime(app: App): ServerStateRuntime {
  const accountStore = useAccountStore();
  const runtime = installServerStateRuntime(app, 'desktop', {
    identityScope: () => accountStore.getCurrentAccountId ?? '',
  });
  currentRuntime = runtime;
  disposed = false;
  return runtime;
}

/** Read the installed runtime (null before install). */
export function getDesktopServerStateRuntime(): ServerStateRuntime | null {
  return currentRuntime;
}

/**
 * Whether the runtime/sources were disposed (logout / profile lock). Deferred startup must
 * not start realtime sources after a logout/lock ran first (plan §3.1 ordering; P2-3).
 * runtime/sources 是否已被 dispose（登出/锁屏）；延迟启动不得在登出/锁屏后继续启动实时源（P2-3）。
 */
export function isDesktopServerStateDisposed(): boolean {
  return disposed;
}

/**
 * Register a cancellation for the deferred startup (requestIdleCallback / setTimeout) so a
 * logout/profile lock that runs before it fires can cancel it (P2-3).
 * 注册延迟启动（requestIdleCallback / setTimeout）的取消器：若登出/锁屏先于它执行则取消（P2-3）。
 */
export function registerDesktopServerStateStartupCancel(cancel: () => void): void {
  pendingStartupCancel = cancel;
}

/** Register a realtime source so logout/profile lock stops it before clearing the cache. */
export function registerDesktopServerStateSource(source: { stop: () => void }): void {
  sources.push(source);
}

/** Stop realtime sources, then clear the cache for an identity (logout / profile lock / switch). */
export function clearDesktopServerStateIdentity(identityScope: string): void {
  disposed = true;
  pendingStartupCancel?.();
  pendingStartupCancel = null;
  for (const source of sources) source.stop();
  sources = [];
  currentRuntime?.clearIdentity(identityScope);
}

/**
 * Map a PowerSync table batch to pilot invalidation intents.
 *
 * Pilot tables: `notifications` → notification lists/unread; `task_templates` → task template
 * lists/details; `rules`/`rule_revisions` →
 * governance lists/details/revisions. Non-pilot tables yield no intents and keep flowing
 * through the legacy Pinia invalidator (plan §3.3 mapping table).
 */
export function mapTablesToInvalidationIntents(
  tables: readonly string[],
  identityScope: string,
): ServerStateInvalidation[] {
  const intents: ServerStateInvalidation[] = [];
  const unique = [...new Set(tables)];
  if (unique.includes('notifications')) {
    intents.push({
      target: 'notification',
      identityScope,
      source: 'powersync',
    });
  }
  if (unique.includes('task_templates')) {
    intents.push({
      target: 'task-template',
      identityScope,
      source: 'powersync',
      projection: 'all',
    });
  }
  if (unique.includes('rules')) {
    intents.push({
      target: 'governance',
      identityScope,
      source: 'powersync',
      projection: 'all',
    });
  }
  if (unique.includes('rule_revisions')) {
    intents.push({
      target: 'governance',
      identityScope,
      source: 'powersync',
      projection: 'revisions',
    });
  }
  return intents;
}
