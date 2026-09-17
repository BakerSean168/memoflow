import { describe, expect, it, vi } from 'vitest';
import { CalendarEntry } from '../../../domain/aggregates/calendar-entry';
import { ScheduleEventApplicationService } from '../schedule-event-application-service';
import { ScheduleRebuildWorkerService } from '../schedule-rebuild-worker-service';
import { ScheduleConflictIntegrityService } from '../schedule-conflict-integrity-service';
import type {
  IScheduleRepository,
  ScheduleRebuildOutboxDTO,
} from '../../../domain/repositories/i-schedule-repository';

function cloneEntry(entry: CalendarEntry): CalendarEntry {
  return CalendarEntry.load({
    id: entry.id,
    identityId: entry.identityId,
    title: entry.title,
    description: entry.description,
    range: entry.range,
    location: entry.location,
    attendees: entry.attendees,
    version: entry.version,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  });
}

class InMemoryScheduleRepository implements IScheduleRepository {
  public schedules = new Map<string, CalendarEntry>();
  public projections = new Map<
    string,
    { hasConflict: boolean; conflictingEntries: string[] | null }
  >();
  public outbox: ScheduleRebuildOutboxDTO[] = [];

  async save(schedule: CalendarEntry, expectedVersion?: number): Promise<void> {
    const existing = this.schedules.get(schedule.id);
    if (expectedVersion !== undefined && (!existing || existing.version !== expectedVersion)) {
      const error = Object.assign(new Error('version conflict'), {
        code: existing ? 'CONFLICT' : 'NOT_FOUND',
        statusCode: existing ? 409 : 404,
        context: existing ? { currentVersion: existing.version, expectedVersion } : undefined,
      });
      throw error;
    }
    this.schedules.set(schedule.id, cloneEntry(schedule));
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<CalendarEntry | null> {
    const entry = this.schedules.get(id);
    return entry?.identityId === identityId ? cloneEntry(entry) : null;
  }

  async findByIdentityId(identityId: string): Promise<CalendarEntry[]> {
    return Array.from(this.schedules.values())
      .filter((entry) => entry.identityId === identityId)
      .map(cloneEntry);
  }

  async deleteById(identityId: string, id: string, expectedVersion: number): Promise<void> {
    const entry = this.schedules.get(id);
    if (!entry || entry.identityId !== identityId) {
      throw Object.assign(new Error(`Schedule event ${id} not found`), {
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    }
    if (entry.version !== expectedVersion) {
      throw Object.assign(new Error('version conflict'), {
        code: 'CONFLICT',
        statusCode: 409,
        context: { currentVersion: entry.version, expectedVersion },
      });
    }
    this.schedules.delete(id);
    this.projections.delete(id);
  }

  async deleteAggregate(entry: CalendarEntry, expectedVersion: number): Promise<void> {
    await this.deleteById(entry.identityId, entry.id, expectedVersion);
  }

  async findByTimeRange(
    identityId: string,
    startTime: number,
    endTime: number,
    excludeId?: string,
  ): Promise<CalendarEntry[]> {
    return Array.from(this.schedules.values())
      .filter((entry) => {
        if (entry.identityId !== identityId || entry.id === excludeId) return false;
        const range = entry.range;
        return range.kind === 'Timed' && range.start < endTime && range.end > startTime;
      })
      .map(cloneEntry);
  }

  async updateConflictProjection(
    identityId: string,
    id: string,
    hasConflict: boolean,
    conflictingEntries: string[] | null,
    sourceRevision: number,
  ): Promise<void> {
    const entry = this.schedules.get(id);
    if (!entry || entry.identityId !== identityId || entry.version > sourceRevision) return;
    this.projections.set(id, {
      hasConflict,
      conflictingEntries: conflictingEntries ? [...conflictingEntries] : null,
    });
  }

  async getConflictProjection(
    identityId: string,
    id: string,
  ): Promise<{ hasConflict: boolean; conflictingEntries: string[] | null } | null> {
    const entry = this.schedules.get(id);
    if (!entry || entry.identityId !== identityId) return null;
    const projection = this.projections.get(id);
    return projection
      ? {
          hasConflict: projection.hasConflict,
          conflictingEntries: projection.conflictingEntries
            ? [...projection.conflictingEntries]
            : null,
        }
      : { hasConflict: false, conflictingEntries: null };
  }

  async createRebuildOutbox(item: {
    identityId: string;
    scheduleId?: string;
    startTime: number;
    endTime: number;
    sourceRevision: number;
    idempotencyKey?: string;
  }): Promise<void> {
    const key = item.idempotencyKey ?? `rebuild:${item.identityId}:${item.sourceRevision}`;
    const existing = this.outbox.find((entry) => entry.idempotencyKey === key);
    const dto: ScheduleRebuildOutboxDTO = {
      id: existing?.id ?? `outbox-${this.outbox.length + 1}`,
      identityId: item.identityId,
      scheduleId: item.scheduleId ?? null,
      startTime: new Date(item.startTime),
      endTime: new Date(item.endTime),
      sourceRevision: item.sourceRevision,
      idempotencyKey: key,
      status: 'pending',
      attempts: 0,
      lastError: null,
      processedAt: null,
      createdAt: existing?.createdAt ?? new Date(),
    };
    if (existing) Object.assign(existing, dto);
    else this.outbox.push(dto);
  }

  async fetchPendingRebuildOutbox(identityId?: string): Promise<ScheduleRebuildOutboxDTO[]> {
    return this.outbox.filter(
      (entry) => entry.status === 'pending' && (!identityId || entry.identityId === identityId),
    );
  }

  async fetchRebuildTimeline(identityId: string): Promise<ScheduleRebuildOutboxDTO[]> {
    return this.outbox.filter((entry) => entry.identityId === identityId);
  }

  async replayRebuildOutbox(): Promise<ScheduleRebuildOutboxDTO> {
    throw new Error('unused');
  }

  async claimRebuildOutboxItems(
    claimToken: string,
    limit = 50,
  ): Promise<ScheduleRebuildOutboxDTO[]> {
    const pending = this.outbox
      .filter((entry) => entry.status === 'pending' || entry.status === 'retry')
      .slice(0, limit);
    for (const entry of pending) {
      entry.status = 'processing';
      entry.claimToken = claimToken;
      entry.claimedAt = new Date();
    }
    return pending;
  }

  async markRebuildOutboxProcessed(
    id: string,
    claimToken: string,
    error?: string,
    maxAttempts = 5,
  ): Promise<void> {
    const entry = this.outbox.find((item) => item.id === id);
    if (!entry || entry.claimToken !== claimToken) return;
    entry.claimToken = null;
    if (!error) {
      entry.status = 'completed';
      entry.processedAt = new Date();
      entry.lastError = null;
      return;
    }
    entry.attempts += 1;
    entry.lastError = error;
    entry.status = entry.attempts >= maxAttempts ? 'failed' : 'retry';
  }

  async createDomainEventOutbox(): Promise<void> {}
  async fetchPendingDomainEventOutbox(): Promise<never[]> {
    return [];
  }
  async claimDomainEventOutboxItems(): Promise<never[]> {
    return [];
  }
  async markDomainEventOutboxProcessed(): Promise<void> {}

  async withTransaction<T>(fn: (repo: IScheduleRepository) => Promise<T>): Promise<T> {
    const schedules = new Map(
      Array.from(this.schedules.entries(), ([id, entry]) => [id, cloneEntry(entry)]),
    );
    const projections = new Map(
      Array.from(this.projections.entries(), ([id, projection]) => [
        id,
        {
          hasConflict: projection.hasConflict,
          conflictingEntries: projection.conflictingEntries
            ? [...projection.conflictingEntries]
            : null,
        },
      ]),
    );
    const outbox = this.outbox.map((entry) => ({ ...entry }));
    try {
      return await fn(this);
    } catch (error) {
      this.schedules = schedules;
      this.projections = projections;
      this.outbox = outbox;
      throw error;
    }
  }
}

const timed = (start: number, end: number) => ({ kind: 'Timed' as const, start, end });

describe('W5 reliability on ADR-080 CalendarEntry range truth', () => {
  const identityId = 'acc_user_w5_test';

  it('preserves expectedVersion optimistic locking and conflict receipts', async () => {
    const repo = new InMemoryScheduleRepository();
    const service = new ScheduleEventApplicationService(repo);
    const created = await service.createSchedule({
      identityId,
      title: 'Initial Event',
      range: timed(1000, 2000),
    });

    const updatedA = await service.updateSchedule(created.id, identityId, {
      title: 'Updated by A',
      expectedVersion: 1,
    });
    expect(updatedA).toMatchObject({ title: 'Updated by A', version: 2 });

    await expect(
      service.updateSchedule(created.id, identityId, {
        title: 'Updated by B',
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      context: { currentVersion: 2, expectedVersion: 1 },
    });
    await expect(service.deleteSchedule(created.id, identityId, 1)).rejects.toMatchObject({
      code: 'CONFLICT',
      context: { currentVersion: 2, expectedVersion: 1 },
    });
    await service.deleteSchedule(created.id, identityId, 2);
    expect(await repo.findByIdForIdentity(identityId, created.id)).toBeNull();
  });

  it('rolls aggregate/projection/outbox work back as one transaction on rebuild write failure', async () => {
    const repo = new InMemoryScheduleRepository();
    const service = new ScheduleEventApplicationService(repo);
    const created = await service.createSchedule({
      identityId,
      title: 'Event To Rollback',
      range: timed(1000, 2000),
    });

    vi.spyOn(repo, 'createRebuildOutbox').mockImplementationOnce(async () => {
      throw new Error('Database transaction fault injected: outbox write error');
    });

    await expect(
      service.updateSchedule(created.id, identityId, {
        title: 'Should Rollback Title',
        expectedVersion: 1,
      }),
    ).rejects.toThrow('Database transaction fault injected');

    expect(await service.getSchedule(created.id, identityId)).toMatchObject({
      title: 'Event To Rollback',
      version: 1,
    });
  });

  it('keeps versioned rebuild outbox restart-safe and duplicate processing idempotent', async () => {
    const repo = new InMemoryScheduleRepository();
    const service = new ScheduleEventApplicationService(repo);
    const worker = new ScheduleRebuildWorkerService(repo, {
      execute: async (_key, task) => ({
        acquired: true,
        value: await task({ ensureHeld: async () => undefined }),
      }),
    });

    const e1 = await service.createSchedule({
      identityId,
      title: 'Event 1',
      range: timed(1000, 2000),
    });
    const e2 = await service.createSchedule({
      identityId,
      title: 'Event 2',
      range: timed(1200, 1800),
    });
    const e3 = await service.createSchedule({
      identityId,
      title: 'Event 3',
      range: timed(1500, 2500),
    });
    await expect(repo.getConflictProjection(identityId, e1.id)).resolves.toMatchObject({
      hasConflict: true,
    });
    await expect(repo.getConflictProjection(identityId, e2.id)).resolves.toMatchObject({
      hasConflict: true,
    });
    await expect(repo.getConflictProjection(identityId, e3.id)).resolves.toMatchObject({
      hasConflict: true,
    });

    await service.deleteSchedule(e3.id, identityId, e3.version);
    const firstRun = await worker.processOutbox(identityId);
    expect(firstRun.processedCount).toBeGreaterThan(0);
    expect(firstRun.failedCount).toBe(0);
    expect((await worker.processOutbox(identityId)).processedCount).toBe(0);

    const latestE2 = await service.getSchedule(e2.id, identityId);
    await service.deleteSchedule(e2.id, identityId, latestE2!.version);
    await worker.processOutbox(identityId);
    await expect(repo.getConflictProjection(identityId, e1.id)).resolves.toEqual({
      hasConflict: false,
      conflictingEntries: null,
    });
  });

  it('compares derived Timed overlap truth against the separate compatibility cache', async () => {
    const repo = new InMemoryScheduleRepository();
    const service = new ScheduleEventApplicationService(repo);
    const integrity = new ScheduleConflictIntegrityService(repo);

    await service.createSchedule({ identityId, title: 'Meeting A', range: timed(100, 300) });
    await service.createSchedule({ identityId, title: 'Meeting B', range: timed(200, 400) });
    await service.createSchedule({ identityId, title: 'Meeting C', range: timed(500, 600) });

    const report = await integrity.verifyConflictCacheIntegrity(identityId, 0, 1000);
    expect(report).toMatchObject({
      isConsistent: true,
      totalSchedules: 3,
      conflictingCount: 2,
      mismatchedCount: 0,
    });
  });
});
