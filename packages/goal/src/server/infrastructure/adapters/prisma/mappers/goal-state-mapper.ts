/**
 * Goal State Mapper
 *
 * Converts raw persistence data → GoalState for domain reconstruction.
 * Shared by Prisma and PowerSync mappers.
 */

import type {
  KeyResultWeightSnapshotDTO,
  KeyResultCalculationMethod,
  GoalReminderConfigDTO,
  GoalReviewSystemContext,
} from '@memoflow/contracts/goal';
import { GoalStatus } from '@memoflow/contracts/goal';
import { IdentityId } from '@memoflow/domain-shared';
import { decodeGoalStartDate, decodeGoalTimeframe } from '../../goal-timeframe-persistence';
import { GoalId, GoalReviewId, KeyResultId } from '../../../../domain';
import {
  KeyResult,
  GoalReview,
  GoalReminderConfig,
  KeyResultWeightSnapshot,
} from '../../../../domain';
import type { GoalState } from '../../../../domain';

/**
 * Raw goal data from infrastructure mappers.
 * Fields are already parsed (not JSON strings) — the mapper provides
 * structured objects directly, eliminating JSON.stringify/parse round-trips.
 */
export interface RawGoalData {
  id: string;
  identityId: string;
  name: string;
  summary: string | null;
  status: string;
  startDate: string | null;
  targetKind: string | null;
  targetEndDate: string | null;
  completedAt: number | null;
  archivedAt: number | null;
  sortOrder: number;
  reminderConfig: { enabled: boolean; triggers: unknown[] } | null;
  keyResults: RawKeyResultData[] | null;
  goalReviews: RawGoalReviewData[] | null;
  weightSnapshots: KeyResultWeightSnapshotDTO[] | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  version: number;
}

export interface RawKeyResultData {
  id: string;
  goalId: string;
  title: string;
  description: string | null;
  progress: {
    initialValue: number;
    trackingBaseValue: number;
    currentValue: number;
    targetValue: number;
    aggregationMethod: string;
    unit: string | null;
  };
  targetKind: string | null;
  targetEndDate: string | null;
  weight: number;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface RawGoalReviewData {
  id: string;
  goalId: string;
  reflection: string;
  challenges: string | null;
  adjustments: string | null;
  systemContext: GoalReviewSystemContext;
  reviewedAt: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Convert raw persistence data to GoalState for Goal.load()
 */
export function rawDataToGoalState(raw: RawGoalData): GoalState {
  const reminderConfig = raw.reminderConfig
    ? GoalReminderConfig.fromDTO(raw.reminderConfig as GoalReminderConfigDTO)
    : null;

  const keyResults = (raw.keyResults || []).map((kr) =>
    KeyResult.load({
      id: KeyResultId.of(kr.id),
      title: kr.title,
      description: kr.description ?? null,
      progress: {
        initialValue: kr.progress.initialValue ?? 0,
        trackingBaseValue: kr.progress.trackingBaseValue ?? kr.progress.currentValue ?? 0,
        currentValue: kr.progress.currentValue ?? 0,
        targetValue: kr.progress.targetValue ?? 100,
        aggregationMethod: (kr.progress.aggregationMethod ?? 'Last') as KeyResultCalculationMethod,
        unit: kr.progress.unit ?? null,
      },
      target: decodeGoalTimeframe(kr.targetKind, kr.targetEndDate),
      weight: kr.weight,
      sortOrder: kr.sortOrder,
      createdAt: Number(kr.createdAt),
      updatedAt: Number(kr.updatedAt),
    }),
  );

  const goalReviews = (raw.goalReviews || []).map((r) =>
    GoalReview.load({
      id: GoalReviewId.of(r.id),
      goalId: GoalId.of(r.goalId),
      reflection: r.reflection,
      challenges: r.challenges ?? null,
      adjustments: r.adjustments ?? null,
      systemContext: r.systemContext,
      reviewedAt: Number(r.reviewedAt),
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
    }),
  );

  const weightSnapshots = (raw.weightSnapshots || []).map((ws) =>
    KeyResultWeightSnapshot.fromDTO(ws),
  );

  return {
    id: GoalId.of(raw.id),
    identityId: IdentityId.of(raw.identityId),
    name: raw.name,
    summary: raw.summary ?? null,
    status: raw.status as GoalStatus,
    startDate: decodeGoalStartDate(raw.startDate),
    target: decodeGoalTimeframe(raw.targetKind, raw.targetEndDate),
    completedAt: raw.completedAt ? Number(raw.completedAt) : null,
    archivedAt: raw.archivedAt ? Number(raw.archivedAt) : null,
    sortOrder: raw.sortOrder,
    reminderConfig,
    version: raw.version ?? 1,
    createdAt: Number(raw.createdAt),
    updatedAt: Number(raw.updatedAt),
    deletedAt: raw.deletedAt ? Number(raw.deletedAt) : null,
    keyResults,
    goalReviews,
    weightSnapshots,
  };
}
