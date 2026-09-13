import type { Ymd } from '@memoflow/contracts/primitives';
import {
  TaskOccurrenceChecklistItemSchema,
  TaskOccurrenceResultSchema,
  TaskOccurrenceStatus,
  TaskTimingSchema,
} from '@memoflow/contracts/task';
import type { ImportanceLevel } from '@memoflow/contracts/shared';
import { IdentityId } from '@memoflow/domain-shared';
import { TaskOccurrence } from '../../../../domain/aggregates/task-occurrence';
import { TaskOccurrenceId } from '../../../../domain/value-objects/task-occurrence-id';
import { TaskPlanId } from '../../../../domain/value-objects/task-plan-id';
import { TaskOccurrenceScheduleSnapshot } from '../../../../domain/value-objects/task-occurrence-schedule-snapshot';

export interface PowerSyncTaskOccurrenceRow {
  id: string;
  plan_id: string;
  identity_id: string;
  occurrence_key: string;
  schedule_date: string;
  schedule_timing: string;
  importance_snapshot: string;
  status: string;
  actual_start_at: string | null;
  result: string | null;
  checklist_state: string;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export class PowerSyncTaskOccurrenceMapper {
  static toDomain(data: PowerSyncTaskOccurrenceRow): TaskOccurrence {
    return TaskOccurrence.load({
      id: TaskOccurrenceId.of(data.id),
      planId: TaskPlanId.of(data.plan_id),
      identityId: IdentityId.of(data.identity_id),
      occurrenceKey: data.occurrence_key,
      scheduleSnapshot: TaskOccurrenceScheduleSnapshot.create({
        date: data.schedule_date as Ymd,
        timing: TaskTimingSchema.parse(JSON.parse(data.schedule_timing)),
      }),
      importanceSnapshot: data.importance_snapshot as ImportanceLevel,
      status: data.status as TaskOccurrenceStatus,
      actualStartAt: data.actual_start_at ? Date.parse(data.actual_start_at) : null,
      result: data.result ? TaskOccurrenceResultSchema.parse(JSON.parse(data.result)) : null,
      checklistState: TaskOccurrenceChecklistItemSchema.array().parse(
        JSON.parse(data.checklist_state || '[]'),
      ),
      version: Number(data.version),
      createdAt: Date.parse(data.created_at),
      updatedAt: Date.parse(data.updated_at),
      deletedAt: data.deleted_at ? Date.parse(data.deleted_at) : null,
    });
  }

  static toPersistence(instance: TaskOccurrence) {
    const dto = instance.toPersistenceState();
    return {
      id: String(dto.id),
      planId: String(dto.planId),
      identityId: String(dto.identityId),
      occurrenceKey: dto.occurrenceKey,
      scheduleDate: dto.scheduleSnapshot.date,
      scheduleTiming: JSON.stringify(dto.scheduleSnapshot.timing),
      importanceSnapshot: dto.importanceSnapshot,
      status: dto.status,
      actualStartAt: dto.actualStartAt != null ? new Date(dto.actualStartAt).toISOString() : null,
      result: dto.result ? JSON.stringify(dto.result) : null,
      checklistState: JSON.stringify(dto.checklistState),
      version: dto.version,
      createdAt: new Date(dto.createdAt).toISOString(),
      updatedAt: new Date(dto.updatedAt).toISOString(),
      deletedAt: dto.deletedAt != null ? new Date(dto.deletedAt).toISOString() : null,
    };
  }
}
