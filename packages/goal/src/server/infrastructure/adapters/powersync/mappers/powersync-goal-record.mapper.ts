import { GoalRecord } from '../../../../domain';
import { GoalRecordId, KeyResultId } from '../../../../domain';
import { IdentityId } from '@memoflow/domain-shared';
import { fromDbDateTime } from '../shared';

function requiredMs(value: string | null | undefined): number {
  return (fromDbDateTime(value) ?? new Date()).getTime();
}

export class PowerSyncGoalRecordMapper {
  static toDomain(row: Record<string, unknown>): GoalRecord {
    return GoalRecord.load({
      id: GoalRecordId.of(String(row.id)),
      keyResultId: KeyResultId.of(String(row.key_result_id)),
      identityId: IdentityId.of(String(row.identity_id)),
      value: Number(row.value ?? 0),
      authorship: row.authorship as GoalRecord['authorship'],
      note: row.note ? String(row.note) : null,
      sourceType: row.source_type
        ? (String(row.source_type) as GoalRecord['sourceType'])
        : null,
      sourceId: row.source_id ? String(row.source_id) : null,
      recordedAt: requiredMs(row.recorded_at ? String(row.recorded_at) : null),
      createdAt: requiredMs(row.created_at ? String(row.created_at) : null),
      updatedAt: requiredMs(row.updated_at ? String(row.updated_at) : null),
    });
  }
}
