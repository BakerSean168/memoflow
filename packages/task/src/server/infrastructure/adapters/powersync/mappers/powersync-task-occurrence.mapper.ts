import { TaskOccurrence } from '../../../../domain/aggregates/task-occurrence';
import { TaskOccurrenceId } from '../../../../domain/value-objects/task-occurrence-id';
import { TaskPlanId } from '../../../../domain/value-objects/task-plan-id';
import { IdentityId } from '@memoflow/domain-shared';
import { TaskTimeConfig } from '../../../../domain/value-objects/task-time-config';
import type { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import { toImportanceLevel } from '../../prisma/mappers/task-row.mapper';

export type PowerSyncTaskOccurrenceRow = {
  id: string;
  template_id: string;
  identity_id: string;
  instance_date: string;
  occurrence_key: string | null; // R2-1 幂等键
  status: string;
  importance: string | null;
  time_config: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  comment: string | null;
  version: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export class PowerSyncTaskOccurrenceMapper {
  static toDomain(data: PowerSyncTaskOccurrenceRow): TaskOccurrence {
    return TaskOccurrence.load({
      id: TaskOccurrenceId.of(data.id),
      templateId: TaskPlanId.of(data.template_id),
      identityId: IdentityId.of(data.identity_id),
      instanceDate: new Date(data.instance_date).getTime(),
      occurrenceKey: data.occurrence_key ?? null,
      timeConfig: TaskTimeConfig.fromDTO(JSON.parse(data.time_config || '{}')),
      importance: toImportanceLevel(data.importance),
      status: data.status as TaskOccurrenceStatus,
      completionRecord: null,
      skipRecord: null,
      actualStartTime: data.actual_start_time ? new Date(data.actual_start_time).getTime() : null,
      actualEndTime: data.actual_end_time ? new Date(data.actual_end_time).getTime() : null,
      note: data.comment ?? null,
      version: data.version ?? 1,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
      deletedAt: data.deleted_at ? new Date(data.deleted_at).getTime() : null,
    });
  }

  static toPersistence(instance: TaskOccurrence) {
    const dto = instance.toServerDTO();
    return {
      id: String(dto.id),
      templateId: String(dto.templateId),
      identityId: String(dto.identityId),
      instanceDate: new Date(dto.instanceDate).toISOString(),
      occurrenceKey: instance.occurrenceKey,
      status: dto.status,
      importance: dto.importance,
      timeConfig: JSON.stringify(dto.timeConfig),
      actualStartTime:
        dto.actualStartTime != null ? new Date(dto.actualStartTime).toISOString() : null,
      actualEndTime: dto.actualEndTime != null ? new Date(dto.actualEndTime).toISOString() : null,
      comment: dto.comment ?? null,
      version: dto.version,
      createdAt: new Date(dto.createdAt).toISOString(),
      updatedAt: new Date(dto.updatedAt).toISOString(),
      deletedAt: dto.deletedAt != null ? new Date(dto.deletedAt).toISOString() : null,
    };
  }
}
