import type { ComposerTranslation } from 'vue-i18n';
import type { ScheduleTaskStatus, SourceModule } from '@memoflow/contracts/schedule';
import { getProductTime } from '../../../shared/utils/product-time';

type Translate = ComposerTranslation;

/**
 * Residual 1222 keep-boundary: app-vue schedule getStatusLabel — ScheduleTaskStatus typed i18n.
 * Active/Paused/Completed/Failed/Cancelled → schedule.taskStatus.*; t injected as first arg.
 * Soft residual 1222: goal domain Draft/Archived i18n + react English identity differ (no force-merge).
 */
export function getStatusLabel(t: Translate, status: ScheduleTaskStatus): string {
  const keyMap: Record<ScheduleTaskStatus, string> = {
    Active: 'schedule.taskStatus.active',
    Paused: 'schedule.taskStatus.paused',
    Completed: 'schedule.taskStatus.completed',
    Failed: 'schedule.taskStatus.failed',
    Cancelled: 'schedule.taskStatus.cancelled',
  };
  return t(keyMap[status] ?? status);
}

/**
 * Maps a ScheduleTaskStatus to a color key.
 */
export function getStatusColor(status: ScheduleTaskStatus): string {
  const colorMap: Record<ScheduleTaskStatus, string> = {
    Active: 'green',
    Paused: 'gray',
    Completed: 'blue',
    Cancelled: 'red',
    Failed: 'orange',
  };
  return colorMap[status] ?? 'gray';
}

/**
 * Maps a SourceModule to its i18n label.
 */
export function getSourceModuleLabel(t: Translate, module: SourceModule): string {
  const keyMap: Record<SourceModule, string> = {
    Reminder: 'schedule.statistics.moduleNames.reminder',
    Task: 'schedule.statistics.moduleNames.task',
    Goal: 'schedule.statistics.moduleNames.goal',
    Notification: 'schedule.statistics.moduleNames.notification',
    System: 'schedule.statistics.moduleNames.system',
    Custom: 'schedule.statistics.moduleNames.custom',
  };
  return t(keyMap[module] ?? module);
}

/**
 * Returns the i18n label for enabled/disabled status.
 */
export function getEnabledLabel(t: Translate, enabled: boolean): string {
  return enabled ? t('schedule.detailDialog.enabled') : t('schedule.detailDialog.disabled');
}

/**
 * Formats an execution summary with i18n.
 */
export function getExecutionSummary(
  t: Translate,
  executionCount: number,
  consecutiveFailures: number,
): string {
  const successCount = executionCount - consecutiveFailures;
  return t('schedule.presentation.executionSummary', {
    total: executionCount,
    success: successCount,
  });
}

/**
 * Maps a health status string to its i18n label.
 */
export function getHealthStatusLabel(
  t: Translate,
  healthStatus: 'healthy' | 'warning' | 'critical',
): string {
  const keyMap = {
    healthy: 'schedule.presentation.healthHealthy',
    warning: 'schedule.presentation.healthWarning',
    critical: 'schedule.presentation.healthCritical',
  } as const;
  return t(keyMap[healthStatus]);
}

/**
 * Computes health status from consecutive failure count.
 */
export function computeHealthStatus(
  consecutiveFailures: number,
): 'healthy' | 'warning' | 'critical' {
  if (consecutiveFailures === 0) return 'healthy';
  if (consecutiveFailures < 3) return 'warning';
  return 'critical';
}

/**
 * Residual 1216 keep-boundary: L4 schedule presentation TransferDate → session dateTime (P1 catalog empty via Style).
 * Not an L5 formatDate* wrapper — module presentation sole for schedule lists.
 */
export function formatScheduleTimestamp(timestamp: number | null | undefined): string {
  if (!timestamp) return getProductTime().presentation.empty.display;
  return getProductTime().format.dateTime(timestamp);
}

/** @deprecated use formatScheduleTimestamp */
export const formatTimestamp = formatScheduleTimestamp;

/**
 * Formats a duration in milliseconds to a human-readable string.
 */
/**
 * Residual 1243 keep-boundary: app-vue schedule formatDuration — durationMs → i18n ms/sec.
 * Exported presentation helper; null|undefined → '-'; <1000ms → durationMs; else durationSec fixed(2).
 * Residual 1324: minutes-based schedule.duration.* dual-retired onto formatScheduleDurationMinutes sole.
 * Soft residual 1243: task graph / Intl formatTaskDuration / ConflictAlert ms floor differ (no force-merge).
 */
export function formatDuration(t: Translate, durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) return '-';
  if (durationMs < 1000) return t('schedule.presentation.durationMs', { ms: durationMs });
  return t('schedule.presentation.durationSec', { sec: (durationMs / 1000).toFixed(2) });
}
