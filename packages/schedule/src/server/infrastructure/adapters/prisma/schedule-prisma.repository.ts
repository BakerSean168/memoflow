/**
 * PrismaScheduleRepository
 * Prisma implementation of IScheduleRepository for CalendarEntry aggregate
 *
 * @module Schedule/Infrastructure
 * @since Story 9.3 (EPIC-SCHEDULE-001)
 */

import type { PrismaClient, Schedule as PrismaSchedule } from '@memoflow/database';
import type { IScheduleRepository, ScheduleRebuildOutboxDTO } from '../../../domain/repositories/i-schedule-repository';
import { CalendarEntry } from '../../../domain/aggregates/calendar-entry';
import { LeaseLostError } from '@memoflow/patterns/lease';
import { PrismaScheduleMapper } from './mappers/prisma-schedule-mapper';
import { toResultErrorException } from '@memoflow/contracts/result';
import type { UnifiedOperationMetricsRecorder } from '@memoflow/patterns/operations';

interface ScheduleDb {
  schedule: PrismaClient['schedule'];
  scheduleRebuildOutbox?: PrismaClient['scheduleRebuildOutbox'];
  scheduleDomainEventOutbox?: PrismaClient['scheduleDomainEventOutbox'];
}

type PrismaTransactionRoot = Pick<PrismaClient, '$transaction'>;
type ScheduleRootDb = ScheduleDb & PrismaTransactionRoot;

function isScheduleRootDb(db: ScheduleDb | ScheduleRootDb): db is ScheduleRootDb {
  return '$transaction' in db;
}

export class SchedulePrismaRepository implements IScheduleRepository {
  private readonly db: ScheduleDb;
  private readonly rootClient: PrismaTransactionRoot | null;
  private readonly metrics?: UnifiedOperationMetricsRecorder;

  constructor(prisma: PrismaClient, rootClient?: PrismaTransactionRoot, metrics?: UnifiedOperationMetricsRecorder);
  constructor(prisma: ScheduleDb, rootClient?: PrismaTransactionRoot, metrics?: UnifiedOperationMetricsRecorder);
  constructor(
    prisma: ScheduleDb | PrismaClient,
    rootClient?: PrismaTransactionRoot,
    metrics?: UnifiedOperationMetricsRecorder,
  ) {
    this.db = prisma;
    this.rootClient = rootClient ?? (isScheduleRootDb(prisma) ? prisma : null);
    this.metrics = metrics;
  }

  private mapToEntity(data: PrismaSchedule): CalendarEntry {
    return PrismaScheduleMapper.toDomain(data);
  }

  private mapToPrisma(schedule: CalendarEntry) {
    return PrismaScheduleMapper.toPersistence(schedule);
  }

  private async flushDomainEvents(schedule: CalendarEntry): Promise<void> {
    if (!this.db.scheduleDomainEventOutbox) return;
    const events = schedule.domainEvents;
    if (events.length === 0) return;

    await this.db.scheduleDomainEventOutbox.createMany({
      data: events.map((evt) => ({
        identityId: String(schedule.identityId),
        scheduleId: String(schedule.id),
        eventType: evt.eventType,
        payload: JSON.stringify(evt.payload ?? null),
        idempotencyKey: `domain:${schedule.identityId}:${schedule.id}:${schedule.version}:${evt.eventType}`,
        status: 'pending',
      })),
      skipDuplicates: true,
    });
  }

  async save(schedule: CalendarEntry, expectedVersion?: number): Promise<void> {
    const data = this.mapToPrisma(schedule);
    await this.flushDomainEvents(schedule);

    if (expectedVersion !== undefined) {
      const updated = await this.db.schedule.updateMany({
        where: {
          id: data.id,
          identityId: data.identityId,
          version: expectedVersion,
        },
        data: {
          ...data,
          version: schedule.version,
        },
      });

      if (updated.count === 0) {
        const current = await this.db.schedule.findFirst({
          where: { id: data.id, identityId: data.identityId },
        });
        if (!current) {
          throw toResultErrorException(
            { code: 'NOT_FOUND', message: `Schedule event ${data.id} not found` },
            404,
          );
        }
        throw toResultErrorException(
          {
            code: 'CONFLICT',
            message: `Schedule event ${data.id} version conflict (expected ${expectedVersion}, current version is ${current.version})`,
            context: { currentVersion: current.version, expectedVersion },
          },
          409,
        );
      }
    } else {
      await this.db.schedule.upsert({
        where: { id: data.id },
        create: data,
        update: data,
      });
    }
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<CalendarEntry | null> {
    const data = await this.db.schedule.findFirst({
      where: { id, identityId },
    });

    return data ? this.mapToEntity(data) : null;
  }

  async findByIdentityId(identityId: string): Promise<CalendarEntry[]> {
    const schedules = await this.db.schedule.findMany({
      where: { identityId },
      orderBy: { startTime: 'asc' },
    });

    return schedules.map((s) => this.mapToEntity(s));
  }

  async findByTimeRange(
    identityId: string,
    startTime: number,
    endTime: number,
    excludeId?: string
  ): Promise<CalendarEntry[]> {
    const schedules = await this.db.schedule.findMany({
      where: {
        identityId,
        startTime: { lt: new Date(endTime) },
        endTime: { gt: new Date(startTime) },
        ...(excludeId && { id: { not: excludeId } }),
      },
      orderBy: { startTime: 'asc' },
    });

    return schedules.map((s) => this.mapToEntity(s));
  }

  async deleteById(identityId: string, id: string, expectedVersion: number): Promise<void> {
    const deleted = await this.db.schedule.deleteMany({
      where: { id, identityId, version: expectedVersion },
    });

    if (deleted.count !== 1) {
      const current = await this.db.schedule.findFirst({
        where: { id, identityId },
      });
      if (!current) {
        throw toResultErrorException(
          { code: 'NOT_FOUND', message: `Schedule event ${id} not found for identity` },
          404,
        );
      }
      throw toResultErrorException(
        {
          code: 'CONFLICT',
          message: `Schedule event ${id} version conflict (expected ${expectedVersion}, current version is ${current.version})`,
          context: { currentVersion: current.version, expectedVersion },
        },
        409,
      );
    }
  }

  async deleteAggregate(entry: CalendarEntry, expectedVersion: number): Promise<void> {
    await this.flushDomainEvents(entry);
    await this.deleteById(entry.identityId, entry.id, expectedVersion);
  }

  async updateConflictProjection(
    identityId: string,
    id: string,
    hasConflict: boolean,
    conflictingEntries: string[] | null,
    sourceRevision: number
  ): Promise<void> {
    const current = await this.db.schedule.findFirst({
      where: { id, identityId },
      select: { version: true, hasConflict: true, conflictingSchedules: true },
    });
    if (!current) return;
    if (current.version > sourceRevision) return;

    const newConflictingStr = conflictingEntries && conflictingEntries.length > 0
      ? JSON.stringify(conflictingEntries)
      : null;

    if (current.hasConflict === hasConflict && current.conflictingSchedules === newConflictingStr) {
      return;
    }

    await this.db.schedule.updateMany({
      where: {
        id,
        identityId,
        version: { lte: sourceRevision },
      },
      data: {
        hasConflict,
        conflictingSchedules: newConflictingStr,
      },
    });
  }

  async createRebuildOutbox(item: {
    identityId: string;
    scheduleId?: string;
    startTime: number;
    endTime: number;
    sourceRevision: number;
    idempotencyKey?: string;
  }): Promise<void> {
    if (!this.db.scheduleRebuildOutbox) return;
    const key =
      item.idempotencyKey ??
      `rebuild:${item.identityId}:${item.scheduleId ?? 'none'}:${item.sourceRevision}:${item.startTime}-${item.endTime}`;

    await this.db.scheduleRebuildOutbox.upsert({
      where: { idempotencyKey: key },
      create: {
        identityId: item.identityId,
        scheduleId: item.scheduleId ?? null,
        startTime: new Date(item.startTime),
        endTime: new Date(item.endTime),
        sourceRevision: item.sourceRevision,
        idempotencyKey: key,
        status: 'pending',
      },
      update: {
        startTime: new Date(item.startTime),
        endTime: new Date(item.endTime),
        sourceRevision: item.sourceRevision,
        status: 'pending',
      },
    });

    // W7 关闭条件：在真实 outbox 持久化成功点发射 persisted
    this.metrics?.recordOutbox('schedule-rebuild', 'persisted');
  }

  async fetchPendingRebuildOutbox(
    identityId?: string,
    limit = 50,
  ): Promise<ScheduleRebuildOutboxDTO[]> {
    if (!this.db.scheduleRebuildOutbox) return [];
    return this.db.scheduleRebuildOutbox.findMany({
      where: {
        ...(identityId && { identityId }),
        status: 'pending',
      },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });
  }

  async fetchRebuildTimeline(
    identityId: string,
    limit = 100,
  ): Promise<ScheduleRebuildOutboxDTO[]> {
    if (!identityId) {
      throw new Error('identityId is required for rebuild timeline query');
    }
    if (!this.db.scheduleRebuildOutbox) {
      throw new Error('[FAIL-CLOSED] scheduleRebuildOutbox model is not available on this client');
    }
    return this.db.scheduleRebuildOutbox.findMany({
      where: { identityId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async replayRebuildOutbox(input: {
    identityId: string;
    operationId: string;
  }): Promise<ScheduleRebuildOutboxDTO> {
    if (!input.identityId || !input.operationId) {
      throw new Error('identityId and operationId are required for rebuild replay');
    }
    if (!this.db.scheduleRebuildOutbox) {
      throw new Error('[FAIL-CLOSED] scheduleRebuildOutbox model is not available on this client');
    }
    const existing = await this.db.scheduleRebuildOutbox.findFirst({
      where: { id: input.operationId, identityId: input.identityId },
    });
    if (!existing) {
      throw new Error(
        `Rebuild outbox operation '${input.operationId}' not found for this identity`,
      );
    }
    if (existing.status !== 'failed') {
      throw new Error(
        `Rebuild outbox operation '${input.operationId}' is not replayable (status: ${existing.status})`,
      );
    }
    const updated = await this.db.scheduleRebuildOutbox.update({
      where: { id: existing.id },
      data: {
        status: 'pending',
        claimToken: null,
        claimedAt: null,
        nextAttemptAt: null,
      },
    });
    return updated;
  }

  /**
   * P1-4：与审计同一事务的 rebuild replay。状态推进与 audit 事实同入一个
   * `prisma.$transaction`；审计写失败时整个事务回滚，绝不留下
   * “已重放但无审计”的部分成功。
   */
  async replayRebuildOutboxWithAudit(
    input: { identityId: string; operationId: string },
    audit: import('@memoflow/patterns/operations').OperationAuditRecordInput,
    auditRepository: import('@memoflow/patterns/operations').OperationAuditRepository,
  ): Promise<ScheduleRebuildOutboxDTO> {
    if (!input.identityId || !input.operationId) {
      throw new Error('identityId and operationId are required for rebuild replay');
    }
    if (!this.db.scheduleRebuildOutbox) {
      throw new Error('[FAIL-CLOSED] scheduleRebuildOutbox model is not available on this client');
    }
    if (!this.rootClient) {
      throw new Error(
        '[FAIL-CLOSED] schedule rebuild atomic replay requires a root Prisma client with $transaction',
      );
    }
    return this.rootClient.$transaction(async (tx) => {
      const existing = await tx.scheduleRebuildOutbox.findFirst({
        where: { id: input.operationId, identityId: input.identityId },
      });
      if (!existing) {
        throw new Error(
          `Rebuild outbox operation '${input.operationId}' not found for this identity`,
        );
      }
      if (existing.status !== 'failed') {
        throw new Error(
          `Rebuild outbox operation '${input.operationId}' is not replayable (status: ${existing.status})`,
        );
      }
      const updated = await tx.scheduleRebuildOutbox.update({
        where: { id: existing.id },
        data: {
          status: 'pending',
          claimToken: null,
          claimedAt: null,
          nextAttemptAt: null,
        },
      });
      await auditRepository.record(
        {
          ...audit,
          details: `status -> ${updated.status}`,
        },
        tx,
      );
      return updated;
    });
  }

  async claimRebuildOutboxItems(
    claimToken: string,
    limit = 50,
    timeoutMs = 30000,
  ): Promise<ScheduleRebuildOutboxDTO[]> {
    if (!this.db.scheduleRebuildOutbox) return [];
    const now = new Date();
    const timeoutThreshold = new Date(now.getTime() - timeoutMs);

    const eligibleCondition = {
      OR: [
        { status: 'pending' },
        { status: 'retry', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { status: 'processing', claimedAt: { lte: timeoutThreshold } },
      ],
    };

    const candidates = await this.db.scheduleRebuildOutbox.findMany({
      where: eligibleCondition,
      take: limit,
      orderBy: { createdAt: 'asc' },
    });

    if (candidates.length === 0) return [];
    const ids = candidates.map((c) => c.id);

    await this.db.scheduleRebuildOutbox.updateMany({
      where: {
        id: { in: ids },
        ...eligibleCondition,
      },
      data: {
        status: 'processing',
        claimToken,
        claimedAt: now,
      },
    });

    return this.db.scheduleRebuildOutbox.findMany({
      where: { id: { in: ids }, claimToken, status: 'processing' },
    });
  }

  async markRebuildOutboxProcessed(
    id: string,
    claimToken: string,
    error?: string,
    maxAttempts = 5,
  ): Promise<void> {
    if (!this.db.scheduleRebuildOutbox) return;
    const now = new Date();

    if (!error) {
      const res = await this.db.scheduleRebuildOutbox.updateMany({
        where: { id, claimToken, status: 'processing' },
        data: {
          status: 'completed',
          processedAt: now,
          claimToken: null,
          lastError: null,
        },
      });
      if (res.count === 0) {
        throw new LeaseLostError(`Rebuild outbox item ${id} is no longer owned by this claim token (lease lost)`);
      }
      return;
    }

    const existing = await this.db.scheduleRebuildOutbox.findFirst({
      where: { id, claimToken, status: 'processing' },
    });
    if (!existing) {
      throw new LeaseLostError(`Rebuild outbox item ${id} is no longer owned by this claim token (lease lost)`);
    }

    const nextAttempts = existing.attempts + 1;
    if (nextAttempts >= maxAttempts) {
      const res = await this.db.scheduleRebuildOutbox.updateMany({
        where: { id, claimToken, status: 'processing' },
        data: {
          status: 'failed',
          attempts: nextAttempts,
          lastError: error,
          claimToken: null,
        },
      });
      if (res.count === 0) {
        throw new LeaseLostError(`Rebuild outbox item ${id} is no longer owned by this claim token (lease lost)`);
      }
    } else {
      const backoffMs = Math.pow(2, nextAttempts) * 1000;
      const res = await this.db.scheduleRebuildOutbox.updateMany({
        where: { id, claimToken, status: 'processing' },
        data: {
          status: 'retry',
          attempts: nextAttempts,
          nextAttemptAt: new Date(now.getTime() + backoffMs),
          lastError: error,
          claimToken: null,
        },
      });
      if (res.count === 0) {
        throw new LeaseLostError(`Rebuild outbox item ${id} is no longer owned by this claim token (lease lost)`);
      }
    }
  }

  async createDomainEventOutbox(
    events: {
      identityId: string;
      scheduleId: string;
      eventType: string;
      payload: string;
      idempotencyKey: string;
    }[],
  ): Promise<void> {
    if (!this.db.scheduleDomainEventOutbox) return;
    if (events.length === 0) return;

    await this.db.scheduleDomainEventOutbox.createMany({
      data: events.map((evt) => ({
        identityId: evt.identityId,
        scheduleId: evt.scheduleId,
        eventType: evt.eventType,
        payload: evt.payload,
        idempotencyKey: evt.idempotencyKey,
        status: 'pending',
      })),
      skipDuplicates: true,
    });
  }

  async fetchPendingDomainEventOutbox(
    identityId?: string,
    limit = 50,
  ): Promise<import('../../../domain/repositories/i-schedule-repository').ScheduleDomainEventOutboxDTO[]> {
    if (!this.db.scheduleDomainEventOutbox) return [];
    return this.db.scheduleDomainEventOutbox.findMany({
      where: {
        ...(identityId && { identityId }),
        status: 'pending',
      },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });
  }

  async claimDomainEventOutboxItems(
    claimToken: string,
    limit = 50,
    timeoutMs = 30000,
  ): Promise<import('../../../domain/repositories/i-schedule-repository').ScheduleDomainEventOutboxDTO[]> {
    if (!this.db.scheduleDomainEventOutbox) return [];
    const now = new Date();
    const timeoutThreshold = new Date(now.getTime() - timeoutMs);

    const eligibleCondition = {
      OR: [
        { status: 'pending' },
        { status: 'retry', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { status: 'processing', claimedAt: { lte: timeoutThreshold } },
      ],
    };

    const candidates = await this.db.scheduleDomainEventOutbox.findMany({
      where: eligibleCondition,
      take: limit,
      orderBy: { createdAt: 'asc' },
    });

    if (candidates.length === 0) return [];
    const ids = candidates.map((c) => c.id);

    await this.db.scheduleDomainEventOutbox.updateMany({
      where: {
        id: { in: ids },
        ...eligibleCondition,
      },
      data: {
        status: 'processing',
        claimToken,
        claimedAt: now,
      },
    });

    return this.db.scheduleDomainEventOutbox.findMany({
      where: { id: { in: ids }, claimToken, status: 'processing' },
    });
  }

  async markDomainEventOutboxProcessed(
    id: string,
    claimToken: string,
    error?: string,
    maxAttempts = 5,
  ): Promise<void> {
    if (!this.db.scheduleDomainEventOutbox) return;
    const now = new Date();

    if (!error) {
      const res = await this.db.scheduleDomainEventOutbox.updateMany({
        where: { id, claimToken, status: 'processing' },
        data: {
          status: 'completed',
          publishedAt: now,
          claimToken: null,
          lastError: null,
        },
      });
      if (res.count === 0) {
        throw new LeaseLostError(`Domain event outbox item ${id} is no longer owned by this claim token (lease lost)`);
      }
      return;
    }

    const existing = await this.db.scheduleDomainEventOutbox.findFirst({
      where: { id, claimToken, status: 'processing' },
    });
    if (!existing) {
      throw new LeaseLostError(`Domain event outbox item ${id} is no longer owned by this claim token (lease lost)`);
    }

    const nextAttempts = existing.attempts + 1;
    if (nextAttempts >= maxAttempts) {
      const res = await this.db.scheduleDomainEventOutbox.updateMany({
        where: { id, claimToken, status: 'processing' },
        data: {
          status: 'failed',
          attempts: nextAttempts,
          lastError: error,
          claimToken: null,
        },
      });
      if (res.count === 0) {
        throw new LeaseLostError(`Domain event outbox item ${id} is no longer owned by this claim token (lease lost)`);
      }
    } else {
      const backoffMs = Math.pow(2, nextAttempts) * 1000;
      const res = await this.db.scheduleDomainEventOutbox.updateMany({
        where: { id, claimToken, status: 'processing' },
        data: {
          status: 'retry',
          attempts: nextAttempts,
          nextAttemptAt: new Date(now.getTime() + backoffMs),
          lastError: error,
          claimToken: null,
        },
      });
      if (res.count === 0) {
        throw new LeaseLostError(`Domain event outbox item ${id} is no longer owned by this claim token (lease lost)`);
      }
    }
  }

  async withTransaction<T>(
    fn: (repo: IScheduleRepository) => Promise<T>
  ): Promise<T> {
    if (!this.rootClient) {
      throw new Error('withTransaction requires a root PrismaClient (not a TransactionClient)');
    }
    return this.rootClient.$transaction(async (tx) => {
      const txRepo = new SchedulePrismaRepository(tx, undefined, this.metrics);
      return fn(txRepo);
    });
  }
}

export default SchedulePrismaRepository;
