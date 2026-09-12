/**
 * Goal Aggregate Root - Server Contracts — GOAL-2101 simplified
 *
 * Goal answers only Direction + Measurement.
 * Legacy fields retired: color, importance, priority, category, tags,
 * folderId, parentGoalId, rollupPolicy.
 * Planning uses calendar-native startDate + precision-preserving target timeframe.
 */

import type { TransferDate, GoalId, IdentityId, Ymd } from '../../../primitives';
import type { GoalStatus } from '../value-objects/goal-status';
import type { KeyResultServerDTO } from '../entities/key-result-server';
import type { GoalReviewServerDTO } from '../entities/goal-review-server';
import type { GoalReminderConfigDTO, GoalTimeframe } from '../value-objects';
import type { KeyResultWeightSnapshotDTO } from '../value-objects/key-result-weight-snapshot';

// ============ Transfer DTO ============

/** Goal Server DTO for API transfer. */
export interface GoalServerDTO {
  id: GoalId;
  identityId: IdentityId;
  name: string;
  summary: string | null;
  status: GoalStatus;
  startDate: Ymd | null;
  target: GoalTimeframe | null;
  completedAt: TransferDate | null;
  archivedAt: TransferDate | null;
  sortOrder: number;
  reminderConfig: GoalReminderConfigDTO | null;

  keyResults: KeyResultServerDTO[] | null;
  weightSnapshots: KeyResultWeightSnapshotDTO[] | null;
  goalReviews: GoalReviewServerDTO[] | null;

  version: number;
  createdAt: TransferDate;
  updatedAt: TransferDate;
  deletedAt: TransferDate | null;
}
