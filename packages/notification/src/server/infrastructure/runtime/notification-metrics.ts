import type { NotificationMetricsSnapshot } from '../../domain/services/notification-metrics-service';
import type { NotificationRuntimeContext } from './notification.runtime';

/**
 * Read-only metrics surface of the notification durable runtime.
 *
 * Recording calls stay inside the dispatch state machine because their
 * position relative to receipt persistence is part of the W7 semantics;
 * this port only exposes the aggregated snapshots.
 */
export interface NotificationRuntimeMetricsPort {
  getMetrics(): NotificationMetricsSnapshot;
  getUnifiedSnapshot(): Readonly<Record<string, number>>;
}

export function createNotificationRuntimeMetricsPort(
  ctx: NotificationRuntimeContext,
): NotificationRuntimeMetricsPort {
  return {
    getMetrics(): NotificationMetricsSnapshot {
      return ctx.metricsService.getMetrics();
    },

    getUnifiedSnapshot(): Readonly<Record<string, number>> {
      return ctx.metricsService.getUnifiedSnapshot();
    },
  };
}
