/**
 * Prisma GoalRecord Mapper
 *
 * Maps between GoalRecord domain aggregate and Prisma model.
 */

import type { GoalRecord as PrismaGoalRecord } from '@memoflow/database';
import { GoalRecord } from '../../../../domain';
import { GoalRecordId, KeyResultId } from '../../../../domain';
import { IdentityId } from '@memoflow/domain-shared';

/** Prisma Date/DateTime → Instant (epoch ms). Required fields never null. */
function requiredInstant(value: Date | string | number | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (value == null) return Date.now();
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : Date.now();
}

export class PrismaGoalRecordMapper {
  /** Maps a Prisma row to a Domain GoalRecord aggregate. */
  static toDomain(data: PrismaGoalRecord): GoalRecord {
    return GoalRecord.load({
      id: GoalRecordId.of(data.id),
      keyResultId: KeyResultId.of(data.keyResultId),
      identityId: IdentityId.of(data.identityId),
      value: data.value,
      authorship: data.authorship as GoalRecord['authorship'],
      note: data.note ?? null,
      sourceType: data.sourceType as GoalRecord['sourceType'],
      sourceId: data.sourceId,
      recordedAt: requiredInstant(data.recordedAt),
      createdAt: requiredInstant(data.createdAt),
      updatedAt: requiredInstant(data.updatedAt),
    });
  }

  /** Batch converts Prisma GoalRecord rows to Domain aggregates. */
  static toDomainList(rows: PrismaGoalRecord[]): GoalRecord[] {
    return rows.map((row) => PrismaGoalRecordMapper.toDomain(row));
  }
}
