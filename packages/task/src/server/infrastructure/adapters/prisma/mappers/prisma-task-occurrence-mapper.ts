/**
 * Prisma TaskOccurrence Mapper
 *
 * Maps between TaskOccurrence domain aggregate and Prisma model.
 * Handles Date/timestamp conversions for instance dates.
 */

import type { TaskOccurrence as PrismaTaskOccurrence } from '@memoflow/database';
import { toDateOrNull } from '@memoflow/utils/shared';
import { TaskOccurrence } from '../../../../domain/aggregates/task-occurrence';
import { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import { TaskOccurrenceId } from '../../../../domain/value-objects/task-occurrence-id';
import { TaskPlanId } from '../../../../domain/value-objects/task-plan-id';
import { IdentityId } from '@memoflow/domain-shared';
import { TaskTimeConfig } from '../../../../domain/value-objects';
import type { ImportanceLevel } from '@memoflow/contracts/shared';

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


export class PrismaTaskOccurrenceMapper {
  /**
   * Prisma record → TaskOccurrence aggregate root
   */
  static toDomain(data: PrismaTaskOccurrence): TaskOccurrence {
    return TaskOccurrence.load({
      id: TaskOccurrenceId.of(data.id),
      templateId: TaskPlanId.of(data.templateId),
      identityId: IdentityId.of(data.identityId),
      instanceDate: data.instanceDate.getTime(),
      occurrenceKey: data.occurrenceKey ?? null,
      timeConfig: TaskTimeConfig.fromDTO(JSON.parse(data.timeConfig || '{}')),
      importance: (data.importance || 'Moderate') as ImportanceLevel,
      status: data.status as TaskOccurrenceStatus,
      completionRecord: null,
      skipRecord: null,
      actualStartTime: data.actualStartTime?.getTime() ?? null,
      actualEndTime: data.actualEndTime?.getTime() ?? null,
      note: data.comment ?? null,
      version: data.version,
      createdAt: requiredInstant(data.createdAt),
      updatedAt: requiredInstant(data.updatedAt),
      deletedAt: optionalInstant(data.deletedAt),
    });
  }

  /**
   * TaskOccurrence 聚合根 → Prisma write data
   */
  static toPersistence(instance: TaskOccurrence) {
    const dto = instance.toServerDTO();
    return {
      templateId: dto.templateId,
      identityId: dto.identityId,
      instanceDate: toDateOrNull(dto.instanceDate) ?? new Date(),
      occurrenceKey: instance.occurrenceKey,
      timeConfig: typeof dto.timeConfig === 'string' ? dto.timeConfig : JSON.stringify(dto.timeConfig) || '{}',
      importance: dto.importance || 'Moderate',
      status: dto.status,
      actualStartTime: toDateOrNull(dto.actualStartTime),
      actualEndTime: toDateOrNull(dto.actualEndTime),
      comment: dto.comment ?? null,
      version: dto.version,
    };
  }

  /**
   * Batch conversion: Prisma → Domain
   */
  static toDomainList(rows: PrismaTaskOccurrence[]): TaskOccurrence[] {
    return rows.map((row) => PrismaTaskOccurrenceMapper.toDomain(row));
  }
}
