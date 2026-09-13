/**
 * Residual 1156: sole toDashboardTaskOccurrenceRecord for dashboard read adapters.
 * API Prisma + Desktop Electron dashboard-read-service duals retired onto this helper.
 * Soft residual 1156: host service wiring (Prisma create* vs Electron get* + logger) remains
 * separate — only the TaskOccurrence → DashboardTaskOccurrenceRecord mapping is sole.
 *
 * ADR-037: source timestamps are Instant (epoch ms).
 */

import type { DashboardTaskOccurrenceRecord } from './types';

/** Canonical TaskOccurrence fields required by the temporary Dashboard projection. */
export interface DashboardTaskOccurrenceSource {
  id: string | number;
  planId: string | number;
  status: string;
  dueAt: number;
  result: { kind: string; recordedAt: number } | null;
  updatedAt: number;
  deletedAt: number | null;
  isOverdue: boolean;
}

export function toDashboardTaskOccurrenceRecord(
  occurrence: DashboardTaskOccurrenceSource,
): DashboardTaskOccurrenceRecord {
  return {
    id: String(occurrence.id),
    templateId: String(occurrence.planId),
    status: occurrence.status,
    // Dashboard is a temporary legacy read model. Feed it the Product-Time dueAt
    // projection rather than resurrecting TaskOccurrence.instanceDate.
    instanceDate: occurrence.dueAt,
    actualEndTime: occurrence.result?.kind === 'Completed' ? occurrence.result.recordedAt : null,
    updatedAt: occurrence.updatedAt,
    deletedAt: occurrence.deletedAt,
    isOverdue: () => occurrence.isOverdue,
  };
}
