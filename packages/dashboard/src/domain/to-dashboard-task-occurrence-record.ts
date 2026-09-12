/**
 * Residual 1156: sole toDashboardTaskOccurrenceRecord for dashboard read adapters.
 * API Prisma + Desktop Electron dashboard-read-service duals retired onto this helper.
 * Soft residual 1156: host service wiring (Prisma create* vs Electron get* + logger) remains
 * separate — only the TaskOccurrence → DashboardTaskOccurrenceRecord mapping is sole.
 *
 * ADR-037: source timestamps are Instant (epoch ms).
 */

import type { DashboardTaskOccurrenceRecord } from './types';

/** Duck-typed task instance fields required by the dashboard projection record. */
export interface DashboardTaskOccurrenceSource {
  id: string | number;
  templateId: string | number;
  status: string;
  instanceDate: number;
  actualEndTime: number | null;
  updatedAt: number;
  deletedAt: number | null;
  isOverdue: boolean;
}

export function toDashboardTaskOccurrenceRecord(
  instance: DashboardTaskOccurrenceSource,
): DashboardTaskOccurrenceRecord {
  return {
    id: String(instance.id),
    templateId: String(instance.templateId),
    status: instance.status,
    instanceDate: instance.instanceDate,
    actualEndTime: instance.actualEndTime,
    updatedAt: instance.updatedAt,
    deletedAt: instance.deletedAt,
    isOverdue: () => instance.isOverdue,
  };
}
