import { Prisma } from '@memoflow/database/prisma';
import type { PrismaClient } from '@memoflow/database';
import type {
  InvocationAttempt as InvocationAttemptContract,
  ScheduledInvocation,
  ScheduledInvocationStatus,
  SchedulingOwner,
  SchedulingReconcileReceipt,
} from '@memoflow/contracts/schedule';
import type {
  IScheduledInvocationRepository,
  ScheduledInvocationClaim,
  ScheduledInvocationCompleteInput,
} from '../../../domain/repositories/i-scheduled-invocation-repository';
import { PrismaInvocationAttemptMapper, PrismaScheduledInvocationMapper } from './mappers/prisma-scheduled-invocation.mapper';
import { generateUUID } from '@memoflow/utils/shared';

type InvocationDb = Pick<PrismaClient, 'scheduledInvocation' | 'invocationAttempt' | 'schedulingReconcileOperation'>;
type InvocationRootDb = InvocationDb & Pick<PrismaClient, '$transaction'>;

export class ScheduledInvocationPrismaRepository implements IScheduledInvocationRepository {
  constructor(
    private readonly db: InvocationDb,
    private readonly rootClient: InvocationRootDb | null = null,
  ) {}

  async findById(id: string): Promise<ScheduledInvocation | null> {
    const row = await this.db.scheduledInvocation.findUnique({ where: { id } });
    return row ? PrismaScheduledInvocationMapper.toDomain(row) : null;
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<ScheduledInvocation | null> {
    const row = await this.db.scheduledInvocation.findFirst({ where: { id, identityId } });
    return row ? PrismaScheduledInvocationMapper.toDomain(row) : null;
  }

  async findByOwner(owner: SchedulingOwner): Promise<ScheduledInvocation[]> {
    const rows = await this.db.scheduledInvocation.findMany({
      where: { identityId: owner.identityId, ownerType: owner.type, ownerId: owner.id },
      orderBy: [{ runAt: 'asc' }, { schedulingKey: 'asc' }],
    });
    return rows.map(PrismaScheduledInvocationMapper.toDomain);
  }

  async listForIdentity(
    identityId: string,
    options: {
      readonly ownerType?: string;
      readonly ownerId?: string;
      readonly status?: ScheduledInvocationStatus;
      readonly dueBefore?: number;
      readonly limit?: number;
    } = {},
  ): Promise<ScheduledInvocation[]> {
    const dueBefore = options.dueBefore === undefined ? undefined : new Date(options.dueBefore);
    const rows = await this.db.scheduledInvocation.findMany({
      where: {
        identityId,
        ...(options.ownerType === undefined ? {} : { ownerType: options.ownerType }),
        ...(options.ownerId === undefined ? {} : { ownerId: options.ownerId }),
        ...(options.status === undefined ? {} : { status: options.status }),
        ...(dueBefore === undefined
          ? {}
          : {
              OR: [
                { status: "pending", runAt: { lte: dueBefore } },
                { status: "retry_wait", nextAttemptAt: { lte: dueBefore } },
              ],
            }),
      },
      orderBy: [{ runAt: "asc" }, { nextAttemptAt: "asc" }, { id: "asc" }],
      take: Math.max(1, Math.min(200, options.limit ?? 100)),
    });
    return rows.map(PrismaScheduledInvocationMapper.toDomain);
  }

  async listOwnersByType(ownerType: string): Promise<SchedulingOwner[]> {
    const rows = await this.db.scheduledInvocation.findMany({
      where: { ownerType, status: { not: 'superseded' } },
      select: { identityId: true, ownerType: true, ownerId: true },
      distinct: ['identityId', 'ownerType', 'ownerId'],
      orderBy: [{ identityId: 'asc' }, { ownerId: 'asc' }],
    });
    return rows.map((row) => ({
      identityId: row.identityId,
      type: row.ownerType,
      id: row.ownerId,
    }));
  }

  async findRunnable(limit?: number): Promise<ScheduledInvocation[]> {
    const rows = await this.db.scheduledInvocation.findMany({
      where: { status: { in: ['pending', 'retry_wait'] } },
      orderBy: [{ runAt: 'asc' }, { nextAttemptAt: 'asc' }, { id: 'asc' }],
      ...(limit === undefined ? {} : { take: limit }),
    });
    return rows.map(PrismaScheduledInvocationMapper.toDomain);
  }

  async findDue(now: number, limit?: number): Promise<ScheduledInvocation[]> {
    const rows = await this.db.scheduledInvocation.findMany({
      where: {
        OR: [
          { status: 'pending', runAt: { lte: new Date(now) } },
          { status: 'retry_wait', nextAttemptAt: { lte: new Date(now) } },
        ],
      },
      orderBy: [{ runAt: 'asc' }, { nextAttemptAt: 'asc' }],
      ...(limit === undefined ? {} : { take: limit }),
    });
    return rows.map(PrismaScheduledInvocationMapper.toDomain);
  }

  async save(invocation: ScheduledInvocation): Promise<void> {
    const data = PrismaScheduledInvocationMapper.toCreate(invocation);
    await this.db.scheduledInvocation.upsert({
      where: { id: invocation.id },
      create: data as Prisma.ScheduledInvocationUncheckedCreateInput,
      update: data as Prisma.ScheduledInvocationUncheckedUpdateInput,
    });
  }

  async supersedeStale(owner: SchedulingOwner, keepSchedulingKeys: readonly string[]): Promise<number> {
    const result = await this.db.scheduledInvocation.updateMany({
      where: {
        identityId: owner.identityId,
        ownerType: owner.type,
        ownerId: owner.id,
        status: { not: 'superseded' },
        ...(keepSchedulingKeys.length > 0 ? { schedulingKey: { notIn: [...keepSchedulingKeys] } } : {}),
      },
      data: {
        status: 'superseded',
        claimToken: null,
        claimExpiresAt: null,
        nextAttemptAt: null,
      },
    });
    return result.count;
  }

  async claimAndStart(input: {
    invocationId: string;
    identityId: string;
    claimToken: string;
    claimExpiresAt: number;
    now: number;
    workerId?: string | null;
  }): Promise<ScheduledInvocationClaim | null> {
    if (this.rootClient) {
      return this.withTransaction((repository) => repository.claimAndStart(input));
    }

    const now = new Date(input.now);
    const claimed = await this.db.scheduledInvocation.updateMany({
      where: {
        id: input.invocationId,
        identityId: input.identityId,
        OR: [
          { status: 'pending', runAt: { lte: now } },
          { status: 'retry_wait', nextAttemptAt: { lte: now } },
        ],
      },
      data: {
        status: 'running',
        attemptCount: { increment: 1 },
        nextAttemptAt: null,
        claimToken: input.claimToken,
        claimExpiresAt: new Date(input.claimExpiresAt),
        fencingToken: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return null;

    const row = await this.db.scheduledInvocation.findUnique({ where: { id: input.invocationId } });
    if (!row) return null;
    const attempt: InvocationAttemptContract = {
      id: generateUUID(),
      identityId: row.identityId,
      invocationId: row.id,
      attemptNumber: row.attemptCount,
      startedAt: input.now,
      finishedAt: null,
      outcome: 'timeout',
      result: null,
      failureCode: null,
      failureMessage: null,
      failureRetryable: null,
      workerId: input.workerId ?? null,
      claimToken: input.claimToken,
      fencingToken: row.fencingToken,
      createdAt: input.now,
    };
    await this.db.invocationAttempt.create({
      data: PrismaInvocationAttemptMapper.toCreate(attempt) as Prisma.InvocationAttemptUncheckedCreateInput,
    });
    return { invocation: PrismaScheduledInvocationMapper.toDomain(row), attempt };
  }

  async completeAttempt(input: ScheduledInvocationCompleteInput): Promise<boolean> {
    if (this.rootClient) {
      return this.withTransaction((repository) => repository.completeAttempt(input));
    }

    const invocation = await this.db.scheduledInvocation.updateMany({
      where: {
        id: input.invocationId,
        identityId: input.identityId,
        status: 'running',
        claimToken: input.claimToken,
        fencingToken: input.fencingToken,
      },
      data: {
        status: input.status,
        nextAttemptAt: input.nextAttemptAt === null ? null : new Date(input.nextAttemptAt),
        claimToken: null,
        claimExpiresAt: null,
      },
    });
    if (invocation.count !== 1) return false;

    const attempt = await this.db.invocationAttempt.updateMany({
      where: {
        invocationId: input.invocationId,
        attemptNumber: input.attemptNumber,
        claimToken: input.claimToken,
        fencingToken: input.fencingToken,
        finishedAt: null,
      },
      data: {
        finishedAt: new Date(input.finishedAt),
        outcome: input.outcome,
        result: input.result === undefined || input.result === null ? Prisma.JsonNull : JSON.parse(JSON.stringify(input.result)),
        failureCode: input.failureCode ?? null,
        failureMessage: input.failureMessage ?? null,
        failureRetryable: input.failureRetryable ?? null,
      },
    });
    if (attempt.count !== 1) throw new Error('Invocation attempt completion failed after state CAS.');
    return true;
  }

  async recoverExpiredClaims(now: number, limit?: number): Promise<number> {
    const where = {
      status: 'running' as const,
      claimExpiresAt: { lt: new Date(now) },
      ...(limit === undefined ? {} : { id: { in: (await this.db.scheduledInvocation.findMany({
        where: { status: 'running', claimExpiresAt: { lt: new Date(now) } },
        select: { id: true }, take: limit,
      })).map((row) => row.id) } }),
    };
    const deadLetter = await this.db.scheduledInvocation.updateMany({
      where: { ...where, attemptCount: { gte: 1 }, retryEnabled: false },
      data: { status: 'dead_letter', claimToken: null, claimExpiresAt: null },
    });
    const retry = await this.db.scheduledInvocation.updateMany({
      where: { ...where, status: 'running' },
      data: { status: 'retry_wait', nextAttemptAt: new Date(now), claimToken: null, claimExpiresAt: null },
    });
    return deadLetter.count + retry.count;
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

  async withTransaction<T>(fn: (repository: IScheduledInvocationRepository) => Promise<T>): Promise<T> {
    if (!this.rootClient) return fn(this);
    return this.rootClient.$transaction(async (tx) => {
      const repository = new ScheduledInvocationPrismaRepository(tx, null);
      return fn(repository);
    });
  }
}
