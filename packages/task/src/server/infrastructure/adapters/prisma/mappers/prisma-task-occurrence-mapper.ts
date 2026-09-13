import type { TaskOccurrence as PrismaTaskOccurrence } from '@memoflow/database';
import type { Ymd } from '@memoflow/contracts/primitives';
import {
  TaskOccurrenceChecklistItemSchema,
  TaskOccurrenceResultSchema,
  TaskOccurrenceStatus,
  TaskTimingSchema,
} from '@memoflow/contracts/task';
import type { ImportanceLevel } from '@memoflow/contracts/shared';
import { IdentityId } from '@memoflow/domain-shared';
import { toDateOrNull } from '@memoflow/utils/shared';
import { TaskOccurrence } from '../../../../domain/aggregates/task-occurrence';
import { TaskOccurrenceId } from '../../../../domain/value-objects/task-occurrence-id';
import { TaskPlanId } from '../../../../domain/value-objects/task-plan-id';
import { TaskOccurrenceScheduleSnapshot } from '../../../../domain/value-objects/task-occurrence-schedule-snapshot';

function requiredInstant(value: Date | string | number): number {
  if (value instanceof Date) return value.getTime();
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid persisted instant: ${String(value)}`);
  return parsed;
}

function optionalInstant(value: Date | string | number | null | undefined): number | null {
  if (value == null) return null;
  return requiredInstant(value);
}

export class PrismaTaskOccurrenceMapper {
  static toDomain(data: PrismaTaskOccurrence): TaskOccurrence {
    const result = data.result ? TaskOccurrenceResultSchema.parse(JSON.parse(data.result)) : null;
    const checklistState = TaskOccurrenceChecklistItemSchema.array().parse(
      JSON.parse(data.checklistState || '[]'),
    );
    return TaskOccurrence.load({
      id: TaskOccurrenceId.of(data.id),
      planId: TaskPlanId.of(data.planId),
      identityId: IdentityId.of(data.identityId),
      occurrenceKey: data.occurrenceKey,
      scheduleSnapshot: TaskOccurrenceScheduleSnapshot.create({
        date: data.scheduleDate as Ymd,
        timing: TaskTimingSchema.parse(JSON.parse(data.scheduleTiming)),
      }),
      importanceSnapshot: data.importanceSnapshot as ImportanceLevel,
      status: data.status as TaskOccurrenceStatus,
      actualStartAt: optionalInstant(data.actualStartAt),
      result,
      checklistState,
      version: data.version,
      createdAt: requiredInstant(data.createdAt),
      updatedAt: requiredInstant(data.updatedAt),
      deletedAt: optionalInstant(data.deletedAt),
    });
  }

  static toPersistence(instance: TaskOccurrence) {
    const dto = instance.toPersistenceState();
    return {
      planId: dto.planId,
      identityId: dto.identityId,
      occurrenceKey: dto.occurrenceKey,
      scheduleDate: dto.scheduleSnapshot.date,
      scheduleTiming: JSON.stringify(dto.scheduleSnapshot.timing),
      importanceSnapshot: dto.importanceSnapshot,
      status: dto.status,
      actualStartAt: toDateOrNull(dto.actualStartAt),
      result: dto.result ? JSON.stringify(dto.result) : null,
      checklistState: JSON.stringify(dto.checklistState),
      version: dto.version,
      updatedAt: new Date(dto.updatedAt),
      deletedAt: toDateOrNull(dto.deletedAt),
    };
  }

  static toDomainList(rows: PrismaTaskOccurrence[]): TaskOccurrence[] {
    return rows.map((row) => PrismaTaskOccurrenceMapper.toDomain(row));
  }
}
