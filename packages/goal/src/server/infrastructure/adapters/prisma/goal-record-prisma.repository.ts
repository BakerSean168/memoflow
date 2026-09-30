/**
 * GoalRecord Prisma Repository
 *
 * Implements IGoalRecordRepository using Prisma.
 * Handles CRUD operations for goal progress records.
 */

import type { PrismaClient, GoalRecord as PrismaGoalRecord, Prisma } from '@memoflow/database';
import type { IGoalRecordRepository, GoalRecordQueryOptions } from '../../../domain';
import { GoalRecord } from '../../../domain';
import { PrismaGoalRecordMapper } from './mappers/prisma-goal-record-mapper';
import type { GoalRecordSourceTypeValue } from '@memoflow/contracts/goal';

export class GoalRecordPrismaRepository implements IGoalRecordRepository {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  /**
   * Map Prisma row to domain aggregate
   */
  private mapToEntity(data: PrismaGoalRecord): GoalRecord {
    return PrismaGoalRecordMapper.toDomain(data);
  }

  /**
   * Build Prisma where/orderBy/take from query options
   */
  private buildQueryOptions(options?: GoalRecordQueryOptions) {
    const where: Prisma.GoalRecordWhereInput = {};
    if (options?.startTime || options?.endTime) {
      const recordedAtFilter: Record<string, unknown> = {};
      if (options?.startTime) {
        recordedAtFilter.gte = options.startTime;
      }
      if (options?.endTime) {
        recordedAtFilter.lte = options.endTime;
      }
      where.recordedAt = recordedAtFilter;
    }

    const direction = options?.orderBy ?? 'desc';
    const orderBy = [{ recordedAt: direction }, { id: direction }];
    const take = options?.limit;

    return { where, orderBy, take };
  }

  /**
   * Find records by key result ID
   */
  async findByKeyResultId(
    identityId: string,
    keyResultId: string,
    options?: GoalRecordQueryOptions,
  ): Promise<GoalRecord[]> {
    const { where, orderBy, take } = this.buildQueryOptions(options);

    const data = await this.prisma.goalRecord.findMany({
      where: { identityId, keyResultId, ...where },
      orderBy,
      ...(take ? { take } : {}),
    });

    return data.map((item: PrismaGoalRecord) => this.mapToEntity(item));
  }

  /**
   * Find records by goal ID (via KeyResult relation)
   */
  async findByGoalId(
    identityId: string,
    goalId: string,
    options?: GoalRecordQueryOptions,
  ): Promise<GoalRecord[]> {
    const { where, orderBy, take } = this.buildQueryOptions(options);

    const data = await this.prisma.goalRecord.findMany({
      where: {
        identityId,
        keyResult: { goalId },
        ...where,
      },
      orderBy,
      ...(take ? { take } : {}),
    });

    return data.map((item: PrismaGoalRecord) => this.mapToEntity(item));
  }

  /**
   * Find records by multiple key result IDs, grouped by key result
   */
  async findByKeyResultIds(
    identityId: string,
    keyResultIds: string[],
    options?: GoalRecordQueryOptions,
  ): Promise<Map<string, GoalRecord[]>> {
    const { where, orderBy, take } = this.buildQueryOptions(options);

    const data = await this.prisma.goalRecord.findMany({
      where: {
        identityId,
        keyResultId: { in: keyResultIds },
        ...where,
      },
      orderBy,
      ...(take ? { take } : {}),
    });

    const result = new Map<string, GoalRecord[]>();
    for (const krId of keyResultIds) {
      result.set(krId, []);
    }
    for (const item of data) {
      const record = this.mapToEntity(item);
      const list = result.get(item.keyResultId) ?? [];
      list.push(record);
      result.set(item.keyResultId, list);
    }
    return result;
  }

  /**
   * Count records for a key result
   */
  async countByKeyResultId(identityId: string, keyResultId: string): Promise<number> {
    return this.prisma.goalRecord.count({
      where: { identityId, keyResultId },
    });
  }

  async findBySource(
    identityId: string,
    sourceType: GoalRecordSourceTypeValue,
    sourceId: string,
  ): Promise<GoalRecord | null> {
    const row = await this.prisma.goalRecord.findFirst({
      where: { identityId, sourceType, sourceId },
    });
    return row ? this.mapToEntity(row) : null;
  }

  /**
   * Protected persistence method - called by base class before event publishing
   */
  async save(record: GoalRecord): Promise<void> {
    const dto = record.toServerDTO();

    await this.prisma.goalRecord.upsert({
      where: { id: dto.id as string },
      create: {
        id: dto.id as string,
        keyResultId: dto.keyResultId as string,
        identityId: dto.identityId as string,
        value: dto.value,
        note: dto.note,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        recordedAt: new Date(dto.recordedAt),
        createdAt: new Date(dto.createdAt),
        updatedAt: new Date(dto.updatedAt),
      },
      update: {
        value: dto.value,
        note: dto.note,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        recordedAt: new Date(dto.recordedAt),
        updatedAt: new Date(dto.updatedAt),
      },
    });
  }

  /**
   * Find a record by identity + ID
   */
  async findByIdForIdentity(identityId: string, recordId: string): Promise<GoalRecord | null> {
    const row = await this.prisma.goalRecord.findFirst({
      where: { id: recordId, identityId },
    });
    return row ? PrismaGoalRecordMapper.toDomain(row) : null;
  }

  /**
   * Delete a record by identity + ID
   */
  async delete(identityId: string, recordId: string): Promise<void> {
    const deleted = await this.prisma.goalRecord.deleteMany({
      where: { id: recordId, identityId },
    });
    if (deleted.count !== 1) {
      throw new Error('Goal record not found for the current identity.');
    }
  }

  /**
   * Delete multiple records by IDs
   */
  async deleteMany(identityId: string, recordIds: string[]): Promise<void> {
    if (recordIds.length === 0) return;
    await this.prisma.goalRecord.deleteMany({
      where: { id: { in: recordIds }, identityId },
    });
  }
}
