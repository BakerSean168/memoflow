import type { GoalServerDTO, GoalMutationReceipt, CreateGoalReq } from '@memoflow/contracts/goal';
import type { LabelDto } from '@memoflow/contracts/label';
import type { Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { Goal } from '../domain';

export type GoalPortabilityKeyResultInput = NonNullable<
  CreateGoalReq['initialKeyResults']
>[number] & {
  trackingBaseValue: number;
};

export type GoalPortabilityCreateInput = Omit<CreateGoalReq, 'initialKeyResults'> & {
  initialKeyResults: GoalPortabilityKeyResultInput[];
};

export type GoalPortabilityKeyResult = NonNullable<GoalServerDTO['keyResults']>[number];

export interface GoalPortabilitySnapshot {
  id: GoalServerDTO['id'];
  identityId: GoalServerDTO['identityId'];
  name: GoalServerDTO['name'];
  summary: GoalServerDTO['summary'];
  status: GoalServerDTO['status'];
  startDate: GoalServerDTO['startDate'];
  target: GoalServerDTO['target'];
  archivedAt: GoalServerDTO['archivedAt'];
  deletedAt: GoalServerDTO['deletedAt'];
  sortOrder: GoalServerDTO['sortOrder'];
  createdAt: GoalServerDTO['createdAt'];
  reminderConfig: GoalServerDTO['reminderConfig'];
  keyResults: GoalPortabilityKeyResult[];
  labels: readonly LabelDto[];
}

export function createGoalPortabilitySnapshot(goal: Goal): GoalPortabilitySnapshot {
  const server = goal.toServerDTO(true);
  return {
    id: server.id,
    identityId: server.identityId,
    name: server.name,
    summary: server.summary,
    status: server.status,
    startDate: server.startDate,
    target: server.target,
    archivedAt: server.archivedAt,
    deletedAt: server.deletedAt,
    sortOrder: server.sortOrder,
    createdAt: server.createdAt,
    reminderConfig: server.reminderConfig,
    keyResults: server.keyResults ?? [],
    labels: goal.labels,
  };
}

export interface GoalPortabilityApplicationPort {
  listGoalSnapshots(identityId: string): Promise<GoalPortabilitySnapshot[]>;
  getGoalSnapshot(id: string, identityId: string): Promise<GoalPortabilitySnapshot | null>;
  createGoalForPortability(
    input: GoalPortabilityCreateInput,
    cx: ExecutionContext,
  ): Promise<Result<GoalMutationReceipt>>;
}
