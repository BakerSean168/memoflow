import type { KeyResultWeightSnapshotDTO, GoalReviewSystemContext } from '@memoflow/contracts/goal';
import { Goal } from '../../../../domain';
import { rawDataToGoalState } from '../../prisma/mappers/goal-state-mapper';
import type {
  RawGoalData,
  RawKeyResultData,
  RawGoalReviewData,
} from '../../prisma/mappers/goal-state-mapper';
export type {
  RawGoalData,
  RawKeyResultData,
  RawGoalReviewData,
} from '../../prisma/mappers/goal-state-mapper';
import { fromDbDateTime } from '../shared';

function requiredMs(value: string | null | undefined): number {
  return (fromDbDateTime(value) ?? new Date()).getTime();
}

function optionalMs(value: string | null | undefined): number | null {
  const d = fromDbDateTime(value);
  return d ? d.getTime() : null;
}

export class PowerSyncGoalMapper {
  static toDomain(
    row: Record<string, unknown>,
    children?: {
      keyResults?: RawKeyResultData[] | null;
      goalReviews?: RawGoalReviewData[] | null;
      weightSnapshots?: KeyResultWeightSnapshotDTO[] | null;
    },
  ): Goal {
    const raw: RawGoalData = {
      id: String(row.id),
      identityId: String(row.identity_id),
      name: String(row.name),
      summary: row.summary ? String(row.summary) : null,
      status: String(row.status),
      startDate: row.start_date ? String(row.start_date) : null,
      targetKind: row.target_kind ? String(row.target_kind) : null,
      targetEndDate: row.target_end_date ? String(row.target_end_date) : null,
      completedAt: optionalMs(row.completed_at ? String(row.completed_at) : null),
      archivedAt: optionalMs(row.archived_at ? String(row.archived_at) : null),
      sortOrder: Number(row.sort_order ?? 0),
      reminderConfig: row.reminder_config ? JSON.parse(String(row.reminder_config)) : null,
      version: Number(row.version ?? 1),
      createdAt: requiredMs(row.created_at ? String(row.created_at) : null),
      updatedAt: requiredMs(row.updated_at ? String(row.updated_at) : null),
      deletedAt: optionalMs(row.deleted_at ? String(row.deleted_at) : null),
      keyResults: children?.keyResults ?? null,
      goalReviews: children?.goalReviews ?? null,
      weightSnapshots: children?.weightSnapshots ?? null,
    };

    return Goal.load(rawDataToGoalState(raw));
  }

  static mapKeyResultRow(row: Record<string, unknown>): RawKeyResultData {
    return {
      id: String(row.id),
      goalId: String(row.goal_id),
      title: String(row.title),
      description: row.description ? String(row.description) : null,
      progress: {
        initialValue: Number(row.initial_value ?? 0),
        trackingBaseValue: Number(row.tracking_base_value ?? row.current_value ?? 0),
        currentValue: Number(row.current_value ?? 0),
        targetValue: Number(row.target_value ?? 100),
        aggregationMethod: row.aggregation_method ? String(row.aggregation_method) : 'Last',
        unit: row.unit ? String(row.unit) : null,
      },
      targetKind: row.target_kind ? String(row.target_kind) : null,
      targetEndDate: row.target_end_date ? String(row.target_end_date) : null,
      weight: Number(row.weight ?? 1),
      sortOrder: Number(row.order ?? 0),
      createdAt: requiredMs(row.created_at ? String(row.created_at) : null),
      updatedAt: requiredMs(row.updated_at ? String(row.updated_at) : null),
    };
  }

  static mapGoalReviewRow(row: Record<string, unknown>): RawGoalReviewData {
    return {
      id: String(row.id),
      goalId: String(row.goal_id),
      reflection: String(row.reflection),
      challenges: row.challenges ? String(row.challenges) : null,
      adjustments: row.adjustments ? String(row.adjustments) : null,
      systemContext: JSON.parse(String(row.system_context)) as GoalReviewSystemContext,
      reviewedAt: requiredMs(row.reviewed_at ? String(row.reviewed_at) : null),
      createdAt: requiredMs(row.created_at ? String(row.created_at) : null),
      updatedAt: requiredMs(row.updated_at ? String(row.updated_at) : null),
    };
  }

  static mapWeightSnapshotRow(row: Record<string, unknown>): KeyResultWeightSnapshotDTO {
    return {
      id: String(row.id) as KeyResultWeightSnapshotDTO['id'],
      goalId: String(row.goal_id) as KeyResultWeightSnapshotDTO['goalId'],
      keyResultId: String(row.key_result_id) as KeyResultWeightSnapshotDTO['keyResultId'],
      identityId: String(row.identity_id) as KeyResultWeightSnapshotDTO['identityId'],
      oldWeight: Number(row.old_weight),
      newWeight: Number(row.new_weight),
      weightDelta: Number(row.weight_delta),
      snapshotTime: requiredMs(row.snapshot_time ? String(row.snapshot_time) : null),
      trigger: String(row.trigger) as KeyResultWeightSnapshotDTO['trigger'],
      reason: row.reason ? String(row.reason) : null,
      operatorId: String(row.operator_id) as KeyResultWeightSnapshotDTO['operatorId'],
      createdAt: requiredMs(row.created_at ? String(row.created_at) : null),
    };
  }
}
