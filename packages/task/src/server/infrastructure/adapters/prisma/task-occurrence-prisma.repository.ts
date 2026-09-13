import type { PrismaClient, TaskOccurrence as PrismaTaskOccurrence } from '@memoflow/database';
import type { Ymd } from '@memoflow/contracts/primitives';
import type { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import { AggregateRepositoryBase, createEventBusAdapter, type IEventBus } from '@memoflow/patterns';
import { eventBus } from '@memoflow/utils/domain';
import { TaskOccurrence } from '../../../domain/aggregates/task-occurrence';
import { OptimisticConcurrencyError } from '../../../domain/errors/optimistic-concurrency.error';
import type {
  ITaskOccurrenceRepository,
  TaskPlanOccurrenceStats,
  TaskPlanStatsWindow,
  TaskOccurrenceStatusCounts,
} from '../../../domain/repositories/i-task-occurrence-repository';
import { PrismaTaskOccurrenceMapper } from './mappers/prisma-task-occurrence-mapper';

const eventBusAdapter = createEventBusAdapter(eventBus);

interface TaskOccurrenceDb {
  taskOccurrence: PrismaClient['taskOccurrence'];
}

export class TaskOccurrencePrismaRepository
  extends AggregateRepositoryBase<TaskOccurrence>
  implements ITaskOccurrenceRepository
{
  private readonly db: TaskOccurrenceDb;

  constructor(prisma: PrismaClient, eventBus?: IEventBus);
  constructor(prisma: TaskOccurrenceDb, eventBus?: IEventBus);
  constructor(prisma: TaskOccurrenceDb | PrismaClient, eventBus: IEventBus = eventBusAdapter) {
    super(eventBus);
    this.db = prisma;
  }

  private mapToEntity(data: PrismaTaskOccurrence): TaskOccurrence {
    return PrismaTaskOccurrenceMapper.toDomain(data);
  }

  protected async persist(occurrence: TaskOccurrence): Promise<void> {
    const data = PrismaTaskOccurrenceMapper.toPersistence(occurrence);
    const updated = await this.db.taskOccurrence.updateMany({
      where: { id: String(occurrence.id), version: occurrence.version - 1 },
      data,
    });
    if (updated.count !== 0) return;

    const existing = await this.db.taskOccurrence.findUnique({
      where: { id: String(occurrence.id) },
      select: { id: true, version: true },
    });
    if (existing) {
      throw new OptimisticConcurrencyError(
        'TaskOccurrence',
        String(occurrence.id),
        occurrence.version - 1,
        existing.version,
      );
    }
    await this.db.taskOccurrence.create({
      data: {
        id: String(occurrence.id),
        ...data,
        createdAt: new Date(occurrence.createdAt),
      },
    });
  }

  async saveMany(occurrences: TaskOccurrence[]): Promise<void> {
    for (const occurrence of occurrences) {
      const existing = await this.db.taskOccurrence.findFirst({
        where: {
          planId: String(occurrence.planId),
          occurrenceKey: occurrence.occurrenceKey,
        },
        select: { id: true },
      });
      if (existing && String(existing.id) !== String(occurrence.id)) continue;
      await this.persist(occurrence);
    }
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<TaskOccurrence | null> {
    const row = await this.db.taskOccurrence.findFirst({ where: { id, identityId } });
    return row ? this.mapToEntity(row) : null;
  }

  async findByPlanId(planId: string, identityId: string): Promise<TaskOccurrence[]> {
    const rows = await this.db.taskOccurrence.findMany({
      where: { planId: planId, identityId, deletedAt: null },
      orderBy: { scheduleDate: 'desc' },
    });
    return rows.map((row) => this.mapToEntity(row));
  }

  async findByIdentityId(identityId: string): Promise<TaskOccurrence[]> {
    const rows = await this.db.taskOccurrence.findMany({
      where: { identityId, deletedAt: null },
      orderBy: { scheduleDate: 'desc' },
    });
    return rows.map((row) => this.mapToEntity(row));
  }

  async findByDateRange(
    identityId: string,
    startDate: Ymd,
    endDate: Ymd,
  ): Promise<TaskOccurrence[]> {
    const rows = await this.db.taskOccurrence.findMany({
      where: {
        identityId,
        scheduleDate: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
      orderBy: { scheduleDate: 'asc' },
    });
    return rows.map((row) => this.mapToEntity(row));
  }

  async findByStatus(identityId: string, status: TaskOccurrenceStatus): Promise<TaskOccurrence[]> {
    const rows = await this.db.taskOccurrence.findMany({
      where: { identityId, status, deletedAt: null },
      orderBy: { scheduleDate: 'desc' },
    });
    return rows.map((row) => this.mapToEntity(row));
  }

  /** Returns open candidates; overdue is derived with Product Time in the application/domain layer. */
  async findOverdueOccurrences(identityId: string): Promise<TaskOccurrence[]> {
    const rows = await this.db.taskOccurrence.findMany({
      where: { identityId, status: { in: ['Pending', 'InProgress'] }, deletedAt: null },
      orderBy: { scheduleDate: 'asc' },
    });
    return rows.map((row) => this.mapToEntity(row));
  }

  async delete(identityId: string, id: string): Promise<void> {
    const result = await this.db.taskOccurrence.deleteMany({ where: { id, identityId } });
    if (result.count !== 1) throw new Error('Task occurrence not found for the current identity.');
  }

  async deleteMany(identityId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.taskOccurrence.deleteMany({ where: { id: { in: ids }, identityId } });
  }

  async deleteByPlanId(planId: string, identityId: string): Promise<void> {
    await this.db.taskOccurrence.deleteMany({ where: { planId: planId, identityId } });
  }

  async countFutureOccurrences(
    planId: string,
    identityId: string,
    fromDate: Ymd,
  ): Promise<number> {
    return this.db.taskOccurrence.count({
      where: { planId: planId, identityId, scheduleDate: { gte: fromDate }, deletedAt: null },
    });
  }

  async findByPlanIdAndDateRange(
    planId: string,
    identityId: string,
    startDate: Ymd,
    endDate: Ymd,
  ): Promise<TaskOccurrence[]> {
    const rows = await this.db.taskOccurrence.findMany({
      where: {
        planId: planId,
        identityId,
        scheduleDate: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
      orderBy: { scheduleDate: 'asc' },
    });
    return rows.map((row) => this.mapToEntity(row));
  }

  async getPlanStats(
    planIds: string[],
    identityId: string,
    window: TaskPlanStatsWindow,
  ): Promise<Record<string, TaskPlanOccurrenceStats>> {
    if (planIds.length === 0) return {};
    const completionWindowDays = 30 as const;
    const grouped = await this.db.taskOccurrence.groupBy({
      by: ['planId', 'status'],
      where: { planId: { in: planIds }, identityId, deletedAt: null },
      _count: { _all: true },
    });
    const dueGrouped = await this.db.taskOccurrence.groupBy({
      by: ['planId', 'status'],
      where: {
        planId: { in: planIds },
        identityId,
        scheduleDate: { gte: window.windowStart, lte: window.asOf },
        deletedAt: null,
      },
      _count: { _all: true },
    });
    const futurePendingGrouped = await this.db.taskOccurrence.groupBy({
      by: ['planId'],
      where: {
        planId: { in: planIds },
        identityId,
        status: 'Pending',
        scheduleDate: { gt: window.asOf },
        deletedAt: null,
      },
      _count: { _all: true },
    });

    const stats: Record<string, TaskPlanOccurrenceStats> = Object.fromEntries(
      planIds.map((planId) => [
        planId,
        {
          planId,
          occurrenceCount: 0,
          completedOccurrenceCount: 0,
          pendingOccurrenceCount: 0,
          dueOccurrenceCount: 0,
          completedDueOccurrenceCount: 0,
          completionWindowDays,
          futurePendingOccurrenceCount: 0,
          singleOccurrenceStatus: null,
          completionRate: 0,
        },
      ]),
    );

    for (const row of grouped) {
      const stat = stats[row.planId];
      if (!stat) continue;
      const count = row._count._all;
      stat.occurrenceCount += count;
      if (row.status === 'Completed') stat.completedOccurrenceCount += count;
      if (row.status === 'Pending') stat.pendingOccurrenceCount += count;
    }
    for (const row of dueGrouped) {
      const stat = stats[row.planId];
      if (!stat) continue;
      const count = row._count._all;
      stat.dueOccurrenceCount += count;
      if (row.status === 'Completed') stat.completedDueOccurrenceCount += count;
    }
    for (const row of futurePendingGrouped) {
      const stat = stats[row.planId];
      if (stat) stat.futurePendingOccurrenceCount = row._count._all;
    }
    for (const stat of Object.values(stats)) {
      if (stat.occurrenceCount === 1) {
        stat.singleOccurrenceStatus =
          (grouped.find((row) => row.planId === stat.planId && row._count._all === 1)
            ?.status as TaskOccurrenceStatus | undefined) ?? null;
      }
      stat.completionRate =
        stat.dueOccurrenceCount > 0
          ? Math.round((stat.completedDueOccurrenceCount / stat.dueOccurrenceCount) * 100)
          : 0;
    }
    return stats;
  }

  async getStatusCountsForPlan(planId: string, identityId: string): Promise<TaskOccurrenceStatusCounts> {
    const grouped = await this.db.taskOccurrence.groupBy({
      by: ['status'],
      where: { planId, identityId, deletedAt: null },
      _count: { _all: true },
    });
    const counts: TaskOccurrenceStatusCounts = { total: 0, completed: 0, missed: 0, skipped: 0, pending: 0, inProgress: 0 };
    for (const row of grouped) {
      const count = row._count._all;
      counts.total += count;
      if (row.status === 'Completed') counts.completed = count;
      if (row.status === 'Missed') counts.missed = count;
      if (row.status === 'Skipped') counts.skipped = count;
      if (row.status === 'Pending') counts.pending = count;
      if (row.status === 'InProgress') counts.inProgress = count;
    }
    return counts;
  }

  async findRecentByPlan(planId: string, identityId: string, limit: number): Promise<TaskOccurrence[]> {
    const rows = await this.db.taskOccurrence.findMany({
      where: { planId, identityId, deletedAt: null },
      orderBy: [{ scheduleDate: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });
    return rows.map((row) => this.mapToEntity(row));
  }

  async deleteIncompleteOccurrencesFrom(
    planId: string,
    identityId: string,
    fromDate: Ymd,
  ): Promise<number> {
    const result = await this.db.taskOccurrence.deleteMany({
      where: {
        planId: planId,
        identityId,
        scheduleDate: { gte: fromDate },
        status: { in: ['Pending', 'InProgress'] },
      },
    });
    return result.count;
  }
}
