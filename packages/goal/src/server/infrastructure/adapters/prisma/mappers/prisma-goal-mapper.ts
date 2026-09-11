/**
 * Prisma Goal Mapper
 *
 * Maps between Goal domain aggregate (with relations) and Prisma model.
 * Returns RawGoalData for domain reconstruction via rawDataToGoalState().
 */

import type {
  Goal as PrismaGoal,
  KeyResult as PrismaKeyResult,
  GoalReview as PrismaGoalReview,
  KeyResultWeightSnapshot as PrismaKeyResultWeightSnapshot,
} from '@memoflow/database';
import type { KeyResultWeightSnapshotDTO } from '@memoflow/contracts/goal';
import type { RawGoalData, RawKeyResultData, RawGoalReviewData } from './goal-state-mapper';

/** Prisma Date/DateTime → Instant (epoch ms). Required fields never null. */
function requiredInstant(value: Date | string | number | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (value == null) return Date.now();
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : Date.now();
}

/** Prisma Date/DateTime → Instant | null. */
function optionalInstant(value: Date | string | number | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Prisma Goal with eagerly loaded relations
 */
export type PrismaGoalWithRelations = PrismaGoal & {
  keyResults?: PrismaKeyResult[];
  reviews?: PrismaGoalReview[];
  keyResultWeightSnapshots?: PrismaKeyResultWeightSnapshot[];
};

/**
 * PrismaGoalMapper
 *
 * Static utility class for mapping between Prisma Goal models and raw domain data.
 */
export class PrismaGoalMapper {
  /**
   * Map a Prisma Goal result (with includes) to RawGoalData
   */
  static toDomainDTO(row: PrismaGoalWithRelations): RawGoalData {
    return {
      id: row.id,
      identityId: row.identityId,
      name: row.name,
      summary: row.summary ?? null,
      status: row.status,
      startDate: optionalInstant(row.startDate),
      dueDate: optionalInstant(row.dueDate),
      completedAt: optionalInstant(row.completedAt),
      archivedAt: optionalInstant(row.archivedAt),
      sortOrder: row.sortOrder ?? 0,
      reminderConfig: row.reminderConfig ? JSON.parse(row.reminderConfig) : null,
      keyResults: row.keyResults ? row.keyResults.map(PrismaGoalMapper.mapKeyResult) : null,
      goalReviews: row.reviews ? row.reviews.map(PrismaGoalMapper.mapGoalReview) : null,
      weightSnapshots: row.keyResultWeightSnapshots
        ? row.keyResultWeightSnapshots.map(PrismaGoalMapper.mapWeightSnapshot)
        : null,
      createdAt: requiredInstant(row.createdAt),
      updatedAt: requiredInstant(row.updatedAt),
      deletedAt: optionalInstant(row.deletedAt),
      version: row.version ?? 1,
    };
  }

  /**
   * Map a Prisma KeyResult row to raw key result data.
   * Progress is built as a structured object (no JSON round-trip).
   */
  static mapKeyResult(row: PrismaKeyResult): RawKeyResultData {
    return {
      id: row.id,
      goalId: row.goalId,
      title: row.title,
      description: row.description ?? null,
      progress: {
        startingValue: row.startingValue ?? 0,
        progressBaselineValue: row.progressBaselineValue ?? null,
        currentValue: row.currentValue ?? 0,
        targetValue: row.targetValue ?? 100,
        aggregationMethod: row.aggregationMethod ?? 'Last',
        unit: row.unit ?? null,
      },
      weight: row.weight ?? 1,
      sortOrder: row.order ?? 0,
      createdAt: requiredInstant(row.createdAt),
      updatedAt: requiredInstant(row.updatedAt),
    };
  }

  static parseReviewSystemContext(
    raw: string,
  ): import('@memoflow/contracts/goal').GoalReviewSystemContext {
    return JSON.parse(raw) as import('@memoflow/contracts/goal').GoalReviewSystemContext;
  }

  static mapGoalReview(row: PrismaGoalReview): RawGoalReviewData {
    return {
      id: row.id,
      goalId: row.goalId,
      reflection: row.reflection,
      challenges: row.challenges ?? null,
      adjustments: row.adjustments ?? null,
      systemContext: PrismaGoalMapper.parseReviewSystemContext(row.systemContext),
      reviewedAt: requiredInstant(row.reviewedAt),
      createdAt: requiredInstant(row.createdAt),
      updatedAt: requiredInstant(row.updatedAt),
    };
  }

  /**
   * Map a Prisma KeyResultWeightSnapshot row to DTO
   */
  static mapWeightSnapshot(row: PrismaKeyResultWeightSnapshot): KeyResultWeightSnapshotDTO {
    return {
      id: row.id as KeyResultWeightSnapshotDTO['id'],
      goalId: row.goalId as KeyResultWeightSnapshotDTO['goalId'],
      keyResultId: row.keyResultId as KeyResultWeightSnapshotDTO['keyResultId'],
      identityId: row.identityId as KeyResultWeightSnapshotDTO['identityId'],
      oldWeight: row.oldWeight,
      newWeight: row.newWeight,
      weightDelta: row.weightDelta,
      snapshotTime:
        row.snapshotTime instanceof Date ? row.snapshotTime.getTime() : row.snapshotTime,
      trigger: row.trigger as KeyResultWeightSnapshotDTO['trigger'],
      reason: row.reason ?? null,
      operatorId: row.operatorId as KeyResultWeightSnapshotDTO['operatorId'],
      createdAt: requiredInstant(row.createdAt),
    };
  }

  /**
   * Parse raw key result progress back to Prisma columns (for write operations)
   */
  static parseKeyResultProgress(kr: RawKeyResultData) {
    return {
      aggregationMethod: kr.progress.aggregationMethod ?? 'Last',
      startingValue: kr.progress.startingValue ?? 0,
      progressBaselineValue: kr.progress.progressBaselineValue ?? null,
      targetValue: kr.progress.targetValue ?? 100,
      currentValue: kr.progress.currentValue ?? 0,
      unit: kr.progress.unit ?? null,
    };
  }
}
