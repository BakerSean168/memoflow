/**
 * Goal Prisma Repository
 *
 * Prisma implementation of IGoalRepository.
 * Supports both PostgreSQL (API) and SQLite (Desktop).
 *
 * Mapping:
 * - Domain Goal → RawGoalData → Prisma result
 * - KeyResult progress is stored as individual columns in Prisma,
 *   mapped through PrismaGoalMapper
 * - GoalReview V2 persists reflection + immutable systemContext directly
 */

import type { PrismaClient, Prisma } from '@memoflow/database';
import {
  GoalLabelOwnershipError,
  GoalVersionConflictError,
  type IGoalRepository,
} from '../../../domain';
import { Goal } from '../../../domain';
import type { GoalSystemView, KeyResultServerDTO } from '@memoflow/contracts/goal';
import { LabelColorSchema, type LabelDto } from '@memoflow/contracts/label';
import {
  AggregateRepositoryBase,
  createEventBusAdapter,
  publishAggregateEvents,
  type IEventBus,
} from '@memoflow/patterns';
import { eventBus } from '@memoflow/utils/domain';
import { PrismaGoalMapper, type PrismaGoalWithRelations } from './mappers/prisma-goal-mapper';
import { rawDataToGoalState, type RawKeyResultData } from './mappers/goal-state-mapper';

const eventBusAdapter = createEventBusAdapter(eventBus);

// ============================================================
// Prisma → Domain Mappers (delegated to PrismaGoalMapper)
// ============================================================

/**
 * Parses KeyResult progress into Prisma columns.
 */
function parseKeyResultProgressForPrisma(kr: RawKeyResultData | KeyResultServerDTO) {
  return PrismaGoalMapper.parseKeyResultProgress(kr as RawKeyResultData);
}

// Include preset for Prisma queries
const GOAL_INCLUDE_ALL = {
  keyResults: { orderBy: { order: 'asc' as const } },
  reviews: { orderBy: { createdAt: 'desc' as const } },
  keyResultWeightSnapshots: { orderBy: { snapshotTime: 'desc' as const } },
};

/**
 * Goal Prisma Repository
 */
export class GoalPrismaRepository extends AggregateRepositoryBase<Goal> implements IGoalRepository {
  constructor(
    private readonly prisma: PrismaClient | Prisma.TransactionClient,
    eventBus: IEventBus = eventBusAdapter,
    private readonly transactionBound = false,
  ) {
    super(eventBus);
  }

  private static labelDto(row: {
    id: string;
    identityId: string;
    name: string;
    normalizedName: string;
    color: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): LabelDto {
    return {
      id: row.id,
      identityId: row.identityId,
      name: row.name,
      normalizedName: row.normalizedName,
      color: row.color == null ? null : LabelColorSchema.parse(row.color),
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  }

  private async loadLabelMap(
    identityId: string,
    goalIds: readonly string[],
  ): Promise<Map<string, LabelDto[]>> {
    const ids = [...new Set(goalIds)];
    const result = new Map(ids.map((id) => [id, [] as LabelDto[]]));
    if (ids.length === 0) return result;
    const links = await this.prisma.goalLabel.findMany({
      where: { identityId, goalId: { in: ids } },
      include: { label: true },
      orderBy: [{ goalId: 'asc' }, { label: { name: 'asc' } }],
    });
    for (const { goalId, label } of links)
      result.get(goalId)?.push(GoalPrismaRepository.labelDto(label));
    return result;
  }

  private async hydrateGoalLabels(goal: Goal, identityId: string): Promise<Goal> {
    const labels = await this.loadLabelMap(identityId, [String(goal.id)]);
    goal.hydrateLabels(labels.get(String(goal.id)) ?? []);
    return goal;
  }

  async replaceLabels(
    identityId: string,
    goalId: string,
    labelIds: readonly string[],
  ): Promise<LabelDto[]> {
    const owner = await this.prisma.goal.findFirst({
      where: { id: goalId, identityId },
      select: { id: true },
    });
    if (!owner) throw new Error('Goal not found.');
    const uniqueIds = [...new Set(labelIds)];
    if (uniqueIds.length > 0) {
      const count = await this.prisma.label.count({ where: { identityId, id: { in: uniqueIds } } });
      if (count !== uniqueIds.length) throw new GoalLabelOwnershipError();
    }
    await this.prisma.goalLabel.deleteMany({ where: { identityId, goalId } });
    if (uniqueIds.length > 0) {
      await this.prisma.goalLabel.createMany({
        data: uniqueIds.map((labelId) => ({ identityId, goalId, labelId })),
      });
    }
    return (await this.loadLabelMap(identityId, [goalId])).get(goalId) ?? [];
  }

  // ================= Read Operations =================

  async findByIdForIdentity(
    identityId: string,
    id: string,
    options?: { includeChildren?: boolean },
  ): Promise<Goal | null> {
    const row = await this.prisma.goal.findFirst({
      where: { id, identityId },
      include: options?.includeChildren ? GOAL_INCLUDE_ALL : undefined,
    });
    if (!row) return null;

    const dto = PrismaGoalMapper.toDomainDTO(row);
    return this.hydrateGoalLabels(Goal.load(rawDataToGoalState(dto)), identityId);
  }

  async findByIdentityId(
    identityId: string,
    options?: {
      includeChildren?: boolean;
      status?: string;
      systemView?: GoalSystemView;
      labelIdsAll?: readonly string[];
    },
  ): Promise<Goal[]> {
    const where: Prisma.GoalWhereInput = {
      identityId,
      deletedAt: null,
      archivedAt: null,
      ...(options?.status && { status: options.status }),
    };

    switch (options?.systemView) {
      case 'active':
        where.status = { in: ['Planned', 'InProgress'] };
        break;
      case 'completed':
        where.status = 'Completed';
        break;
      case 'abandoned':
        where.status = 'Abandoned';
        break;
      case 'archived':
        where.archivedAt = { not: null };
        break;
      case 'all':
      case undefined:
        break;
    }

    const requiredLabelIds = [...new Set(options?.labelIdsAll ?? [])];
    if (requiredLabelIds.length > 0) {
      const links = await this.prisma.goalLabel.findMany({
        where: { identityId, labelId: { in: requiredLabelIds } },
        select: { goalId: true, labelId: true },
      });
      const found = new Map<string, Set<string>>();
      for (const link of links) {
        const set = found.get(link.goalId) ?? new Set<string>();
        set.add(link.labelId);
        found.set(link.goalId, set);
      }
      const matchingGoalIds = [...found.entries()]
        .filter(([, labels]) => requiredLabelIds.every((labelId) => labels.has(labelId)))
        .map(([goalId]) => goalId);
      if (matchingGoalIds.length === 0) return [];
      where.id = { in: matchingGoalIds };
    }

    const rows = await this.prisma.goal.findMany({
      where,
      include: GOAL_INCLUDE_ALL,
      orderBy: { createdAt: 'desc' },
    });
    const labelMap = await this.loadLabelMap(
      identityId,
      rows.map((row) => row.id),
    );
    return rows.map((row: PrismaGoalWithRelations) => {
      const goal = Goal.load(rawDataToGoalState(PrismaGoalMapper.toDomainDTO(row)));
      goal.hydrateLabels(labelMap.get(row.id) ?? []);
      return goal;
    });
  }

  async findByKeyResultIdForIdentity(
    identityId: string,
    keyResultId: string,
  ): Promise<Goal | null> {
    const row = await this.prisma.goal.findFirst({
      where: {
        identityId,
        keyResults: { some: { id: keyResultId } },
      },
      include: GOAL_INCLUDE_ALL,
    });
    if (!row) return null;
    return this.hydrateGoalLabels(
      Goal.load(rawDataToGoalState(PrismaGoalMapper.toDomainDTO(row))),
      identityId,
    );
  }

  // ================= Write Operations =================

  /**
   * Protected persistence method - called by base class before event publishing
   */
  protected async persist(goal: Goal): Promise<void> {
    const dto = goal.toServerDTO(true);

    // Run in a transaction for consistency
    const persistInTransaction = async (tx: Prisma.TransactionClient) => {
      // 1. Upsert the Goal root
      await tx.goal.upsert({
        where: { id: dto.id as string },
        create: {
          id: dto.id as string,
          identityId: dto.identityId as string,
          name: dto.name,
          summary: dto.summary,
          status: dto.status,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
          archivedAt: dto.archivedAt ? new Date(dto.archivedAt) : null,
          sortOrder: dto.sortOrder,
          reminderConfig: dto.reminderConfig ? JSON.stringify(dto.reminderConfig) : null,
          version: dto.version,
          deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : null,
        },
        update: {
          name: dto.name,
          summary: dto.summary,
          status: dto.status,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
          archivedAt: dto.archivedAt ? new Date(dto.archivedAt) : null,
          sortOrder: dto.sortOrder,
          reminderConfig: dto.reminderConfig ? JSON.stringify(dto.reminderConfig) : null,
          version: dto.version,
          deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : null,
          updatedAt: new Date(),
        },
      });

      // 2. Sync KeyResults: upsert current, delete removed
      if (dto.keyResults) {
        const currentKrIds = dto.keyResults.map((kr) => kr.id as string);

        // Delete KeyResults that no longer exist in the aggregate
        await tx.keyResult.deleteMany({
          where: {
            goalId: dto.id as string,
            id: { notIn: currentKrIds },
          },
        });

        // Upsert each KeyResult
        for (const kr of dto.keyResults) {
          const progress = parseKeyResultProgressForPrisma(kr);
          await tx.keyResult.upsert({
            where: { id: kr.id as string },
            create: {
              id: kr.id as string,
              goalId: dto.id as string,
              identityId: dto.identityId as string,
              title: kr.title,
              description: kr.description,
              aggregationMethod: progress.aggregationMethod,
              startingValue: progress.startingValue,
              progressBaselineValue: progress.progressBaselineValue,
              targetValue: progress.targetValue,
              currentValue: progress.currentValue,
              unit: progress.unit,
              weight: kr.weight,
              order: kr.sortOrder,
            },
            update: {
              title: kr.title,
              description: kr.description,
              aggregationMethod: progress.aggregationMethod,
              startingValue: progress.startingValue,
              progressBaselineValue: progress.progressBaselineValue,
              targetValue: progress.targetValue,
              currentValue: progress.currentValue,
              unit: progress.unit,
              weight: kr.weight,
              order: kr.sortOrder,
              updatedAt: new Date(),
            },
          });
        }
      }

      // 3. Sync GoalReviews: upsert current, delete removed
      if (dto.goalReviews) {
        const currentReviewIds = dto.goalReviews.map((r) => r.id as string);

        await tx.goalReview.deleteMany({
          where: {
            goalId: dto.id as string,
            id: { notIn: currentReviewIds },
          },
        });

        for (const review of dto.goalReviews) {
          await tx.goalReview.upsert({
            where: { id: review.id as string },
            create: {
              id: review.id as string,
              goalId: dto.id as string,
              identityId: dto.identityId as string,
              reflection: review.reflection,
              challenges: review.challenges,
              adjustments: review.adjustments,
              systemContext: JSON.stringify(review.systemContext),
              reviewedAt: new Date(review.reviewedAt),
            },
            update: {
              reflection: review.reflection,
              challenges: review.challenges,
              adjustments: review.adjustments,
              systemContext: JSON.stringify(review.systemContext),
              reviewedAt: new Date(review.reviewedAt),
              updatedAt: new Date(),
            },
          });
        }
      }

      // 4. Sync Weight Snapshots (insert-only — snapshots are immutable)
      if (dto.weightSnapshots && dto.weightSnapshots.length > 0) {
        for (const ws of dto.weightSnapshots) {
          // Check if snapshot already exists (idempotent)
          const exists = await tx.keyResultWeightSnapshot.findUnique({
            where: { id: ws.id as string },
          });
          if (!exists) {
            await tx.keyResultWeightSnapshot.create({
              data: {
                id: ws.id as string,
                goalId: dto.id as string,
                identityId: dto.identityId as string,
                keyResultId: ws.keyResultId as string,
                oldWeight: ws.oldWeight,
                newWeight: ws.newWeight,
                weightDelta: ws.weightDelta,
                snapshotTime: new Date(ws.snapshotTime),
                trigger: ws.trigger,
                reason: ws.reason ?? null,
                operatorId: ws.operatorId as string,
              },
            });
          }
        }
      }
    };

    if (this.transactionBound) {
      await persistInTransaction(this.prisma as Prisma.TransactionClient);
      return;
    }

    await (this.prisma as PrismaClient).$transaction(persistInTransaction);
  }

  async saveRootWithExpectedVersion(goal: Goal, expectedVersion: number): Promise<void> {
    if (!this.transactionBound) {
      await (this.prisma as PrismaClient).$transaction(async (tx) => {
        const repository = new GoalPrismaRepository(tx, this.eventBus, true);
        await repository.persistWithExpectedVersion(goal, expectedVersion);
      });
      await publishAggregateEvents(goal, { eventBus: this.eventBus });
      return;
    }

    await this.persistWithExpectedVersion(goal, expectedVersion);
    await publishAggregateEvents(goal, { eventBus: this.eventBus });
  }

  private async persistWithExpectedVersion(goal: Goal, expectedVersion: number): Promise<void> {
    const dto = goal.toServerDTO(false);
    const result = await this.prisma.goal.updateMany({
      where: { id: String(dto.id), identityId: String(dto.identityId), version: expectedVersion },
      data: {
        name: dto.name,
        summary: dto.summary,
        status: dto.status,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
        archivedAt: dto.archivedAt ? new Date(dto.archivedAt) : null,
        reminderConfig: dto.reminderConfig ? JSON.stringify(dto.reminderConfig) : null,
        version: dto.version,
        updatedAt: new Date(),
      },
    });
    if (result.count !== 1) throw new GoalVersionConflictError();
    await this.persist(goal);
  }

  // ================= Delete Operations =================

  async delete(identityId: string, id: string): Promise<void> {
    const deleted = await this.prisma.goal.deleteMany({
      where: { id, identityId },
    });
    if (deleted.count !== 1) {
      throw new Error('Goal not found for the current identity.');
    }
  }

  async deleteWithExpectedVersion(
    identityId: string,
    id: string,
    expectedVersion: number,
  ): Promise<void> {
    const deleted = await this.prisma.goal.deleteMany({
      where: { id, identityId, version: expectedVersion },
    });
    if (deleted.count !== 1) throw new GoalVersionConflictError();
  }

  // ================= Utility Operations =================

  async findAllGoalRefs(): Promise<Array<{ id: string; identityId: string }>> {
    const rows = await this.prisma.goal.findMany({
      select: { id: true, identityId: true },
    });
    return rows.map((row) => ({ id: row.id, identityId: row.identityId }));
  }

  async exists(identityId: string, id: string): Promise<boolean> {
    const count = await this.prisma.goal.count({ where: { id, identityId } });
    return count > 0;
  }

  async batchUpdateStatus(identityId: string, ids: string[], status: string): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.goal.updateMany({
      where: { id: { in: ids }, identityId },
      data: { status, updatedAt: new Date() },
    });
  }
}
