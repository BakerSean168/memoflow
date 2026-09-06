/**
 * Desktop Platform — Electron-specific Feature Initialization
 *
 * Hooks into Electron IPC events for tray, shortcuts, online/offline,
 * window state management, and PowerSync data-change broadcasts.
 * Called once during app startup.
 */
import type { App } from 'vue';
import { RendererEventChannels } from '@memoflow/contracts/electron';

import { useAccountStore } from '@memoflow/app-vue/modules/account';
import { useGoalStore } from '@memoflow/app-vue/modules/goal';
import { useTaskStore } from '@memoflow/app-vue/modules/task';
import { useScheduleStore } from '@memoflow/app-vue/modules/schedule';
import { useReminderStore } from '@memoflow/app-vue/modules/reminder';
import { useUserSettingStore } from '@memoflow/app-vue/modules/setting';
// Residual 941: host bridge via getElectronBridge sole helper.
import { getElectronBridge } from './electron-bridge';
import { getDesktopServerStateRuntime, mapTablesToInvalidationIntents } from './server-state';

const api = getElectronBridge();

export function initElectronFeatures(app: App): void {
  void app;

  if (!api) return;

  setupTraySync();
  setupShortcuts();
  setupOnlineStatus();
  setupDbChangeListener();
}

function setupTraySync(): void {
  api?.on(RendererEventChannels.TRAY_ACTION, (...args: unknown[]) => {
    const action = args[1] as string | undefined;
    if (action) {
      console.log('[Electron] Tray action:', action);
    }
  });
}

function setupShortcuts(): void {
  api?.on(RendererEventChannels.SHORTCUT_TRIGGERED, (...args: unknown[]) => {
    const shortcut = args[1] as string | undefined;
    if (shortcut) {
      console.log('[Electron] Shortcut triggered:', shortcut);
    }
  });
}

function setupOnlineStatus(): void {
  window.addEventListener('online', () => {
    console.log('[Electron] Network: online');
  });
  window.addEventListener('offline', () => {
    console.log('[Electron] Network: offline');
  });
}

// ──────────────────────────────────────────────
// PowerSync db:changed → Pinia store invalidation
// ──────────────────────────────────────────────

/**
 * Maps PowerSync table names to the domain module whose Pinia store
 * should be invalidated when the table changes.
 */
const TABLE_TO_MODULE: Record<string, string> = {
  accounts: 'account',
  // Goal
  goals: 'goal',
  key_results: 'goal',
  goal_records: 'goal',
  goal_reviews: 'goal',
  key_result_weight_snapshots: 'goal',
  // Task
  task_templates: 'task',
  task_instances: 'task',
  task_template_history: 'task',
  task_statistics: 'task',
  // Schedule
  schedules: 'schedule',
  schedule_tasks: 'schedule',
  schedule_executions: 'schedule',
  schedule_statistics: 'schedule',
  // Reminder
  reminder_templates: 'reminder',
  reminder_groups: 'reminder',
  reminder_instances: 'reminder',
  reminder_history: 'reminder',
  reminder_statistics: 'reminder',
  reminder_responses: 'reminder',
  user_reminder_preferences: 'reminder',
  // Notification
  notifications: 'notification',
  notification_channels: 'notification',
  notification_history: 'notification',
  notification_preferences: 'notification',
  notification_templates: 'notification',
  // Settings
  user_settings: 'setting',
};

/**
 * Module name → Pinia store invalidation function (non-pilot modules keep the legacy path).
 *
 * go through the server-state dispatcher instead; the pilot stores keep no
 * `setInitialized(false)` flag.
 * 非 pilot 模块继续走旧 Pinia invalidator；pilot 表走 dispatcher。
 */
const MODULE_INVALIDATORS: Record<string, () => void> = {
  account: () => useAccountStore().setInitialized(false),
  goal: () => useGoalStore().setInitialized(false),
  task: () => useTaskStore().setInitialized(false),
  schedule: () => useScheduleStore().setInitialized(false),
  reminder: () => useReminderStore().setInitialized(false),
  setting: () => useUserSettingStore().setInitialized(false),
};

/**
 * PowerSync pilot tables that must be routed through the server-state dispatcher.
 * 必须走 server-state dispatcher 的 PowerSync pilot 表。
 */
const PILOT_TABLES = new Set([
  'notifications',
  'task_templates',
  'rules',
  'rule_revisions',
]);

/**
 * Listens for `db:changed` events from the main process (PowerSync onChange).
 * Pilot tables are mapped to invalidation intents and dispatched (Step 3); other modules
 * keep flowing through the legacy Pinia invalidators. Also emits the `db:tables-changed`
 * CustomEvent so active components can react immediately if desired.
 */
function setupDbChangeListener(): void {
  api?.on(RendererEventChannels.DB_CHANGED, (...args: unknown[]) => {
    const payload = args[0] as { tables: string[] } | undefined;
    if (!payload?.tables?.length) return;

    const identityScope = useAccountStore().getCurrentAccountId ?? '';
    const runtime = getDesktopServerStateRuntime();

    const pilotTables = payload.tables.filter((table) => PILOT_TABLES.has(table));
    if (runtime && identityScope && pilotTables.length > 0) {
      for (const intent of mapTablesToInvalidationIntents(pilotTables, identityScope)) {
        void runtime.dispatcher.invalidate(intent);
      }
    }

    // Non-pilot modules keep the legacy Pinia invalidator.
    const modules = new Set<string>();
    for (const table of payload.tables) {
      if (PILOT_TABLES.has(table)) continue;
      const mod = TABLE_TO_MODULE[table];
      if (mod) modules.add(mod);
    }

    for (const mod of modules) {
      MODULE_INVALIDATORS[mod]?.();
    }

    if (modules.size > 0) {
      console.log('[Electron] db:changed → invalidated:', [...modules].join(', '));
    }

    // Emit a DOM event for components that want immediate reactivity
    window.dispatchEvent(
      new CustomEvent('db:tables-changed', {
        detail: { tables: payload.tables, modules: [...modules] },
      }),
    );
  });
}
