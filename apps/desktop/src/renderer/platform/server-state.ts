/**
 * Desktop renderer server-state runtime holder + PowerSync bridge mapping.
 *
 * Creates and installs the renderer-owned Query Cache runtime (lane: desktop PowerSync/IPC)
 * and keeps a single instance so logout / profile lock handlers can clear the identity cache.
 * Pilot table → invalidation intent mapping is centralized here (plan §3.3, Step 3).
 */

import type { App } from 'vue';
import { NOTIFICATION_ATTENTION_TABLES } from './notification-attention-tables';
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

/** PowerSync tables whose committed writes change the Routine upcoming projection. */
export const ROUTINE_PROJECTION_TABLES = new Set([
  'routine_definitions',
  'routine_preferences',
  'routine_profiles',
  'routine_profile_memberships',
  'routine_occurrences',
  'routine_temporary_overrides',
]);

/**
 * Map a PowerSync table batch to pilot invalidation intents.
 *
 * Pilot tables: `notifications` → notification lists/unread; `task_plans` → task template
 * lists/details; Routine projection tables → identity-scoped routine-upcoming. Non-pilot
 * tables yield no intents and keep flowing through the legacy Pinia invalidator
 * (plan §3.3 mapping table).
 *
 * Routine changes committed by Local MCP/AI or another client arrive here after PowerSync
 * sync/reconnect, so the mounted Planner and capsules re-read the owner projection.
 */
export function mapTablesToInvalidationIntents(
  tables: readonly string[],
  identityScope: string,
): ServerStateInvalidation[] {
  const intents: ServerStateInvalidation[] = [];
  const unique = [...new Set(tables)];
  if (unique.some((table) => NOTIFICATION_ATTENTION_TABLES.has(table))) {
    intents.push({
      target: 'notification',
      identityScope,
      source: 'powersync',
    });
  }
  if (unique.includes('task_plans')) {
    intents.push({
      target: 'task-plan',
      identityScope,
      source: 'powersync',
      projection: 'all',
    });
  }
  if (unique.some((table) => ROUTINE_PROJECTION_TABLES.has(table))) {
    intents.push({
      target: 'routine-upcoming',
      identityScope,
      source: 'powersync',
    });
  }

  return intents;
}
