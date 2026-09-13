import type { PrismaClient, TaskOccurrence as PrismaTaskOccurrence } from '@memoflow/database';
import type { Ymd } from '@memoflow/contracts/primitives';
import type { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import { AggregateRepositoryBase, createEventBusAdapter, type IEventBus } from '@memoflow/patterns';
import { eventBus } from '@memoflow/utils/domain';
import { TaskOccurrence } from '../../../domain/aggregates/task-occurrence';
import { OptimisticConcurrencyError } from '../../../domain/errors/optimistic-concurrency.error';
import type {
  ITaskOccurrenceRepository,
  TaskPlanInstanceStats,
  TaskPlanStatsWindow,
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

  protected async persist(instance: TaskOccurrence): Promise<void> {
    const data = PrismaTaskOccurrenceMapper.toPersistence(instance);
    const updated = await this.db.taskOccurrence.updateMany({
      where: { id: String(instance.id), version: instance.version - 1 },
      data,
    });
    if (updated.count !== 0) return;

    const existing = await this.db.taskOccurrence.findUnique({
      where: { id: String(instance.id) },
      select: { id: true, version: true },
    });
    if (existing) {
      throw new OptimisticConcurrencyError(
        'TaskOccurrence',
        String(instance.id),
        instance.version - 1,
        existing.version,
      );
    }
    await this.db.taskOccurrence.create({
      data: {
        id: String(instance.id),
        ...data,
        createdAt: new Date(instance.createdAt),
      },
    });
  }

  async saveMany(instances: TaskOccurrence[]): Promise<void> {
    for (const instance of instances) {
      const existing = await this.db.taskOccurrence.findFirst({
        where: {
          planId: String(instance.planId),
          occurrenceKey: instance.occurrenceKey,
        },
        select: { id: true },
      });
      if (existing && String(existing.id) !== String(instance.id)) continue;
      await this.persist(instance);
    }
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<TaskOccurrence | null> {
    const row = await this.db.taskOccurrence.findFirst({ where: { id, identityId } });
    return row ? this.mapToEntity(row) : null;
  }

  async findByTemplateId(templateId: string, identityId: string): Promise<TaskOccurrence[]> {
    const rows = await this.db.taskOccurrence.findMany({
      where: { planId: templateId, identityId, deletedAt: null },
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
  async findOverdueInstances(identityId: string): Promise<TaskOccurrence[]> {
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

  async deleteByTemplateId(templateId: string, identityId: string): Promise<void> {
    await this.db.taskOccurrence.deleteMany({ where: { planId: templateId, identityId } });
  }

  async countFutureInstances(
    templateId: string,
    identityId: string,
    fromDate: Ymd,
  ): Promise<number> {
    return this.db.taskOccurrence.count({
      where: { planId: templateId, identityId, scheduleDate: { gte: fromDate }, deletedAt: null },
    });
  }

  async findByTemplateIdAndDateRange(
    templateId: string,
    identityId: string,
    startDate: Ymd,
    endDate: Ymd,
  ): Promise<TaskOccurrence[]> {
    const rows = await this.db.taskOccurrence.findMany({
      where: {
        planId: templateId,
        identityId,
        scheduleDate: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
      orderBy: { scheduleDate: 'asc' },
    });
    return rows.map((row) => this.mapToEntity(row));
  }

  async getTemplateStats(
    templateIds: string[],
    identityId: string,
    window: TaskPlanStatsWindow,
  ): Promise<Record<string, TaskPlanInstanceStats>> {
    if (templateIds.length === 0) return {};
    const completionWindowDays = 30 as const;
    const grouped = await this.db.taskOccurrence.groupBy({
      by: ['planId', 'status'],
      where: { planId: { in: templateIds }, identityId, deletedAt: null },
      _count: { _all: true },
    });
    const dueGrouped = await this.db.taskOccurrence.groupBy({
      by: ['planId', 'status'],
      where: {
        planId: { in: templateIds },
        identityId,
        scheduleDate: { gte: window.windowStart, lte: window.asOf },
        deletedAt: null,
      },
      _count: { _all: true },
    });
    const futurePendingGrouped = await this.db.taskOccurrence.groupBy({
      by: ['planId'],
      where: {
        planId: { in: templateIds },
        identityId,
        status: 'Pending',
        scheduleDate: { gt: window.asOf },
        deletedAt: null,
      },
      _count: { _all: true },
    });

    const stats: Record<string, TaskPlanInstanceStats> = Object.fromEntries(
      templateIds.map((templateId) => [
        templateId,
        {
          templateId,
          instanceCount: 0,
          completedInstanceCount: 0,
          pendingInstanceCount: 0,
          dueInstanceCount: 0,
          completedDueInstanceCount: 0,
          completionWindowDays,
          futurePendingInstanceCount: 0,
          singleInstanceStatus: null,
          completionRate: 0,
        },
      ]),
    );

    for (const row of grouped) {
      const stat = stats[row.planId];
      if (!stat) continue;
      const count = row._count._all;
      stat.instanceCount += count;
      if (row.status === 'Completed') stat.completedInstanceCount += count;
      if (row.status === 'Pending') stat.pendingInstanceCount += count;
    }
    for (const row of dueGrouped) {
      const stat = stats[row.planId];
      if (!stat) continue;
      const count = row._count._all;
      stat.dueInstanceCount += count;
      if (row.status === 'Completed') stat.completedDueInstanceCount += count;
    }
    for (const row of futurePendingGrouped) {
      const stat = stats[row.planId];
      if (stat) stat.futurePendingInstanceCount = row._count._all;
    }
    for (const stat of Object.values(stats)) {
      if (stat.instanceCount === 1) {
        stat.singleInstanceStatus =
          (grouped.find((row) => row.planId === stat.templateId && row._count._all === 1)
            ?.status as TaskOccurrenceStatus | undefined) ?? null;
      }
      stat.completionRate =
        stat.dueInstanceCount > 0
          ? Math.round((stat.completedDueInstanceCount / stat.dueInstanceCount) * 100)
          : 0;
    }
    return stats;
  }

  async deleteIncompleteInstancesFrom(
    templateId: string,
    identityId: string,
    fromDate: Ymd,
  ): Promise<number> {
    const result = await this.db.taskOccurrence.deleteMany({
      where: {
        planId: templateId,
        identityId,
        scheduleDate: { gte: fromDate },
        status: { in: ['Pending', 'InProgress'] },
      },
    });
    return result.count;
  }
}
