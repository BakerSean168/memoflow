import type {
  GoalServerDTO,
  GoalMutationReceipt,
  CreateGoalReq,
  GoalRecordSourceTypeValue,
  GoalReviewSystemContext,
} from '@memoflow/contracts/goal';
import type {
  GoalRecordId,
  GoalReviewId,
  Instant,
  KeyResultId,
} from '@memoflow/contracts/primitives';
import type { LabelDto } from '@memoflow/contracts/label';
import type { Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { Goal, GoalRecord, GoalReview } from '../domain';

export interface GoalPortabilityRecordInput {
  id: GoalRecordId;
  keyResultId: KeyResultId;
  value: number;
  note: string | null;
  sourceType: GoalRecordSourceTypeValue | null;
  sourceId: string | null;
  recordedAt: Instant;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface GoalPortabilityReviewInput {
  id: GoalReviewId;
  reflection: string;
  challenges: string | null;
  adjustments: string | null;
  systemContext: GoalReviewSystemContext;
  reviewedAt: Instant;
  createdAt: Instant;
  updatedAt: Instant;
}

export type GoalPortabilityKeyResultInput = NonNullable<
  CreateGoalReq['initialKeyResults']
>[number] & {
  trackingBaseValue: number;
};

export type GoalPortabilityCreateInput = Omit<CreateGoalReq, 'initialKeyResults'> & {
  initialKeyResults: GoalPortabilityKeyResultInput[];
};

export type GoalPortabilityRestoreInput = GoalPortabilityCreateInput & {
  records: GoalPortabilityRecordInput[];
  reviews: GoalPortabilityReviewInput[];
};

export type GoalPortabilityKeyResult = NonNullable<GoalServerDTO['keyResults']>[number];

export interface GoalPortabilitySnapshot {
  id: GoalServerDTO['id'];
  identityId: GoalServerDTO['identityId'];
  name: GoalServerDTO['name'];
  summary: GoalServerDTO['summary'];
  status: GoalServerDTO['status'];
  version: number;
  completedAt: GoalServerDTO['completedAt'];
  startDate: GoalServerDTO['startDate'];
  target: GoalServerDTO['target'];
  archivedAt: GoalServerDTO['archivedAt'];
  deletedAt: GoalServerDTO['deletedAt'];
  sortOrder: GoalServerDTO['sortOrder'];
  createdAt: GoalServerDTO['createdAt'];
  reminderConfig: GoalServerDTO['reminderConfig'];
  keyResults: GoalPortabilityKeyResult[];
  labels: readonly LabelDto[];
  records: readonly GoalRecord[];
  reviews: readonly GoalReview[];
}

export function createGoalPortabilitySnapshot(
  goal: Goal,
  records: readonly GoalRecord[] = [],
): GoalPortabilitySnapshot {
  const server = goal.toServerDTO(true);
  return {
    id: server.id,
    identityId: server.identityId,
    name: server.name,
    summary: server.summary,
    status: server.status,
    version: server.version,
    completedAt: server.completedAt,
    startDate: server.startDate,
    target: server.target,
    archivedAt: server.archivedAt,
    deletedAt: server.deletedAt,
    sortOrder: server.sortOrder,
    createdAt: server.createdAt,
    reminderConfig: server.reminderConfig,
    keyResults: server.keyResults ?? [],
    labels: goal.labels,
    records,
    reviews: goal.goalReviews,
  };
}

export interface GoalPortabilityApplicationPort {
  listGoalSnapshots(identityId: string): Promise<GoalPortabilitySnapshot[]>;
  getGoalSnapshot(id: string, identityId: string): Promise<GoalPortabilitySnapshot | null>;
  createGoalForPortability(
    input: GoalPortabilityCreateInput,
    cx: ExecutionContext,
  ): Promise<Result<GoalMutationReceipt>>;
  restoreGoalForPortability(
    input: GoalPortabilityRestoreInput,
    cx: ExecutionContext,
  ): Promise<Result<GoalMutationReceipt>>;
}
