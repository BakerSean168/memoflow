/**
 * Prisma Schedule Task Repository
 *
 * Responsibilities:
 * - Implements IScheduleTaskRepository interface
 * - Uses mapper for data mapping
 * - Manages ScheduleExecution child entity persistence
 * - Publishes domain events after successful persistence
 *
 * @implements {IScheduleTaskRepository}
 */

import type {
  PrismaClient,
  Prisma,
} from '@memoflow/database';
import type { IScheduleTaskRepository } from '../../../domain/repositories/i-schedule-task-repository';
import { ScheduleTask } from '../../../domain/aggregates/schedule-task';
import type {
  SchedulingOwner,
  SchedulingReconcileReceipt,
  SourceModule,
} from '@memoflow/contracts/schedule';
import { ScheduleTaskStatus } from '@memoflow/contracts/schedule';
import {
  AggregateRepositoryBase,
  createEventBusAdapter,
  publishAggregateEvents,
  type IOutboxWriter,
} from '@memoflow/patterns';
import { eventBus } from '@memoflow/utils/domain';
import {
  PrismaScheduleTaskMapper,
  type PrismaScheduleTaskWithExecutions,
} from './mappers/prisma-schedule-task-mapper';
import { PrismaScheduleExecutionMapper } from './mappers/prisma-schedule-execution-mapper';

const eventBusAdapter = createEventBusAdapter(eventBus);

/**
 * Minimal DB capability interface for ScheduleTask repository.
 * Both PrismaClient and Prisma.TransactionClient satisfy this.
 */
interface ScheduleTaskDb {
  scheduleTask: PrismaClient['scheduleTask'];
  scheduleExecution: PrismaClient['scheduleExecution'];
  schedulingReconcileOperation: PrismaClient['schedulingReconcileOperation'];
}

type PrismaTransactionRoot = Pick<PrismaClient, '$transaction'>;
type ScheduleTaskRootDb = ScheduleTaskDb & PrismaTransactionRoot;

function isScheduleTaskRootDb(db: ScheduleTaskDb | ScheduleTaskRootDb): db is ScheduleTaskRootDb {
  return '$transaction' in db;
}

/**
 * Query options for ScheduleTask.
 */
interface IScheduleTaskQueryOptions {
  identityId: string;
  sourceModule?: SourceModule;
  sourceEntityId?: string;
  status?: ScheduleTaskStatus;
  isEnabled?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * ScheduleTaskRepository
 *
 * Prisma-based DDD Repository implementation for the ScheduleTask aggregate.
 */
export class ScheduleTaskPrismaRepository
  extends AggregateRepositoryBase<ScheduleTask>
  implements IScheduleTaskRepository
{
  private readonly db: ScheduleTaskDb;
  private readonly rootClient: PrismaTransactionRoot | null;
  private readonly transactionDeferredAggregates: Set<ScheduleTask> | null;

  constructor(
    prisma: ScheduleTaskDb | PrismaClient,
    rootClient?: PrismaTransactionRoot,
    outboxWriter?: IOutboxWriter,
    transactionDeferredAggregates?: Set<ScheduleTask>,
  ) {
    // R1-2：事件总线失败时的 durable outbox 兜底（可选）。
    super(eventBusAdapter, outboxWriter);
    this.db = prisma;
    this.rootClient = rootClient ?? (isScheduleTaskRootDb(prisma) ? prisma : null);
    this.transactionDeferredAggregates = transactionDeferredAggregates ?? null;
  }

  // ===== Mapping =====

  /** Converts a Prisma record to a ScheduleTask aggregate root. */
  private toDomain(data: PrismaScheduleTaskWithExecutions): ScheduleTask {
    return PrismaScheduleTaskMapper.toDomain(data);
  }

  /** Converts a ScheduleTask aggregate to Prisma write data. */
  private toPrisma(task: ScheduleTask) {
    return PrismaScheduleTaskMapper.toPersistence(task);
  }

  // ===== Core CRUD =====

  /**
   * Transaction-scoped repositories persist directly into the caller's Prisma
   * transaction and defer domain-event publication until the outer commit.
   */
  override async save(task: ScheduleTask): Promise<void> {
    if (!this.transactionDeferredAggregates) {
      await super.save(task);
      return;
    }

    await this.persistWithin(this.db, task);
    this.transactionDeferredAggregates.add(task);
  }

  /**
   * Protected persistence method — called by base class before event publishing.
   * Normal single-aggregate saves retain their existing atomic transaction.
   */
  protected async persist(task: ScheduleTask): Promise<void> {
    if (!this.rootClient) {
      throw new Error('persist with transaction requires a root PrismaClient');
    }
    await this.rootClient.$transaction(async (tx) => {
      await this.persistWithin(tx, task);
    });
  }

  private async persistWithin(db: ScheduleTaskDb, task: ScheduleTask): Promise<void> {
    const data = this.toPrisma(task);
    await db.scheduleTask.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });

    const executions = task.executions;
    if (executions && executions.length > 0) {
      for (const execution of executions) {
        const execData = PrismaScheduleExecutionMapper.toCreateInput(execution) as Record<string, unknown> & {
          id: string;
          status: string;
        };
        await db.scheduleExecution.upsert({
          where: { id: execData.id },
          create: {
            ...execData,
            identityId: task.identityId,
          } as unknown as Prisma.ScheduleExecutionCreateInput,
          update: {
            status: execData.status,
            duration: (execData.duration as number | null) ?? null,
            result: execData.result ?? null,
            error: (execData.error as string | null) ?? null,
            retryCount: (execData.retryCount as number) ?? 0,
          },
        });
      }
    }
  }

  async findById(id: string): Promise<ScheduleTask | null> {
    const data = await this.db.scheduleTask.findUnique({
      where: { id },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Load the latest 10 execution records
        },
      },
    });

    return data ? this.toDomain(data) : null;
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<ScheduleTask | null> {
    const data = await this.db.scheduleTask.findFirst({
      where: { id, identityId },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return data ? this.toDomain(data) : null;
  }

  async deleteById(identityId: string, id: string): Promise<void> {
    const deleted = await this.db.scheduleTask.deleteMany({
      where: { id, identityId },
    });
    if (deleted.count !== 1) {
      throw new Error('Schedule task not found for the current identity.');
    }
  }

  // ===== Query Methods =====

  async findByIdentityId(identityId: string): Promise<ScheduleTask[]> {
    const tasks = await this.db.scheduleTask.findMany({
      where: { identityId },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return tasks.map((task) => this.toDomain(task));
  }

  async findBySourceModule(module: SourceModule, identityId: string): Promise<ScheduleTask[]> {
    const tasks = await this.db.scheduleTask.findMany({
      where: {
        sourceModule: module,
        identityId,
      },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return tasks.map((task) => this.toDomain(task));
  }

  async findBySourceEntity(
    module: SourceModule,
    entityId: string,
    identityId: string,
  ): Promise<ScheduleTask[]> {
    const tasks = await this.db.scheduleTask.findMany({
      where: {
        sourceModule: module,
        sourceEntityId: entityId,
        identityId,
      },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return tasks.map((task) => this.toDomain(task));
  }

  async findBySchedulingOwner(owner: SchedulingOwner): Promise<ScheduleTask[]> {
    const tasks = await this.db.scheduleTask.findMany({
      where: {
        identityId: owner.identityId,
        ownerType: owner.type,
        ownerId: owner.id,
        schedulingKey: { not: null },
      },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return tasks.map((task) => this.toDomain(task));
  }

  async listSchedulingOwners(ownerType?: string): Promise<SchedulingOwner[]> {
    const rows = await this.db.scheduleTask.findMany({
      where: {
        schedulingKey: { not: null },
        ownerType: { not: null },
        ownerId: { not: null },
        ...(ownerType ? { ownerType } : {}),
      },
      select: {
        identityId: true,
        ownerType: true,
        ownerId: true,
      },
      distinct: ['identityId', 'ownerType', 'ownerId'],
    });

    return rows.map((row) => ({
      identityId: row.identityId,
      type: row.ownerType as string,
      id: row.ownerId as string,
    }));
  }

  async appendSchedulingReconcileReceipt(receipt: SchedulingReconcileReceipt): Promise<void> {
    await this.db.schedulingReconcileOperation.create({
      data: {
        operationId: receipt.operationId,
        identityId: receipt.owner.identityId,
        ownerType: receipt.owner.type,
        ownerId: receipt.owner.id,
        status: receipt.status,
        desiredCount: receipt.desiredCount,
        createdCount: receipt.createdCount,
        updatedCount: receipt.updatedCount,
        deletedCount: receipt.deletedCount,
        unchangedCount: receipt.unchangedCount,
        failureCode: receipt.failure?.code ?? null,
        failureMessage: receipt.failure?.message ?? null,
        failureRetryable: receipt.failure?.retryable ?? null,
        startedAt: new Date(receipt.startedAt),
        finishedAt: new Date(receipt.finishedAt),
      },
    });
  }

  async findByStatus(status: ScheduleTaskStatus, identityId: string): Promise<ScheduleTask[]> {
    const tasks = await this.db.scheduleTask.findMany({
      where: {
        status: status,
        identityId,
      },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return tasks.map((task) => this.toDomain(task));
  }

  async findEnabled(identityId?: string): Promise<ScheduleTask[]> {
    const tasks = await this.db.scheduleTask.findMany({
      where: {
        enabled: true,
        ...(identityId && { identityId }),
      },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return tasks.map((task) => this.toDomain(task));
  }

  async claimForExecution(id: string, expectedNextRunAt: Date): Promise<boolean> {
    const result = await this.db.scheduleTask.updateMany({
      where: {
        id,
        status: ScheduleTaskStatus.Active,
        enabled: true,
        nextRunAt: expectedNextRunAt,
      },
      data: { lastRunAt: new Date() },
    });
    return result.count > 0;
  }

  async findDueTasksForExecution(beforeTime: Date, limit?: number): Promise<ScheduleTask[]> {
    // Find active tasks with nextRunAt <= beforeTime for execution
    const tasks = await this.db.scheduleTask.findMany({
      where: {
        enabled: true,
        status: ScheduleTaskStatus.Active,
        nextRunAt: {
          lte: beforeTime, // Use <= for the SQL query
        },
      },
      orderBy: {
        nextRunAt: 'asc', // Earliest due tasks first
      },
      take: limit,
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return tasks.map((task) => this.toDomain(task));
  }

  async query(options: IScheduleTaskQueryOptions): Promise<ScheduleTask[]> {
    const where: Prisma.ScheduleTaskWhereInput = {
      identityId: options.identityId,
    };

    if (options.sourceModule) where.sourceModule = options.sourceModule;
    if (options.sourceEntityId) where.sourceEntityId = options.sourceEntityId;
    if (options.status) where.status = options.status;
    if (options.isEnabled !== undefined) where.enabled = options.isEnabled;

    const tasks = await this.db.scheduleTask.findMany({
      where,
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
      take: options.limit,
      skip: options.offset,
    });

    return tasks.map((task) => this.toDomain(task));
  }

  async count(options: IScheduleTaskQueryOptions): Promise<number> {
    const where: Prisma.ScheduleTaskWhereInput = {
      identityId: options.identityId,
    };

    if (options.sourceModule) where.sourceModule = options.sourceModule;
    if (options.sourceEntityId) where.sourceEntityId = options.sourceEntityId;
    if (options.status) where.status = options.status;
    if (options.isEnabled !== undefined) where.enabled = options.isEnabled;

    return this.db.scheduleTask.count({ where });
  }

  // ===== Batch Operations =====

  async saveBatch(tasks: ScheduleTask[]): Promise<void> {
    for (const task of tasks) {
      await this.save(task);
    }
  }

  async deleteBatch(identityId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.scheduleTask.deleteMany({
      where: {
        identityId,
        id: {
          in: ids,
        },
      },
    });
  }

  // ===== Transaction Support =====

  async withTransaction<T>(fn: (repo: IScheduleTaskRepository) => Promise<T>): Promise<T> {
    if (this.transactionDeferredAggregates) {
      return fn(this);
    }
    if (!this.rootClient) {
      throw new Error('withTransaction requires a root PrismaClient (not a TransactionClient)');
    }

    const deferredAggregates = new Set<ScheduleTask>();
    const result = await this.rootClient.$transaction(
      async (tx) => {
        const txRepo = new ScheduleTaskPrismaRepository(
          tx,
          undefined,
          this.outboxWriter,
          deferredAggregates,
        );
        return fn(txRepo);
      },
      { isolationLevel: 'Serializable' },
    );

    // Publish only after the owner-level transaction committed successfully.
    for (const aggregate of deferredAggregates) {
      await publishAggregateEvents(aggregate, {
        eventBus: eventBusAdapter,
        outboxWriter: this.outboxWriter,
      });
    }
    return result;
  }
}
