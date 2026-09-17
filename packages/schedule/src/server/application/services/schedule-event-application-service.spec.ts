import { describe, expect, it } from 'vitest';
import { requireYmd } from '@memoflow/contracts/primitives';
import { IdentityId } from '@memoflow/domain-shared';
import type {
  IScheduleRepository,
  ScheduleRebuildOutboxDTO,
} from '../../domain/repositories/i-schedule-repository';
import { CalendarEntry } from '../../domain/aggregates/calendar-entry';
import { ScheduleConflictDetectionService } from './schedule-conflict-detection-service';
import { ScheduleEventApplicationService } from './schedule-event-application-service';

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
  private schedules = new Map<string, CalendarEntry>();
  public outbox: ScheduleRebuildOutboxDTO[] = [];
  public saveCalls = 0;

  async save(schedule: CalendarEntry, expectedVersion?: number): Promise<void> {
    const existing = this.schedules.get(schedule.id);
    if (expectedVersion !== undefined && (!existing || existing.version !== expectedVersion)) {
      throw Object.assign(new Error('version conflict'), {
        code: existing ? 'CONFLICT' : 'NOT_FOUND',
        context: existing ? { currentVersion: existing.version, expectedVersion } : undefined,
      });
    }
    this.saveCalls += 1;
    this.schedules.set(schedule.id, cloneEntry(schedule));
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<CalendarEntry | null> {
    const entry = this.schedules.get(id);
    return entry && entry.identityId === identityId ? cloneEntry(entry) : null;
  }

  async findByIdentityId(identityId: string): Promise<CalendarEntry[]> {
    return Array.from(this.schedules.values())
      .filter((entry) => entry.identityId === identityId)
      .map(cloneEntry);
  }

  async deleteById(identityId: string, id: string, expectedVersion: number): Promise<void> {
    const entry = this.schedules.get(id);
    if (!entry || entry.identityId !== identityId) {
      throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' });
    }
    if (entry.version !== expectedVersion) {
      throw Object.assign(new Error('version conflict'), {
        code: 'CONFLICT',
        context: { currentVersion: entry.version, expectedVersion },
      });
    }
    this.schedules.delete(id);
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
      .map(cloneEntry)
      .sort((left, right) => {
        const a = left.range;
        const b = right.range;
        return a.kind === 'Timed' && b.kind === 'Timed' ? a.start - b.start : 0;
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
    this.outbox.push({
      id: `outbox-${this.outbox.length + 1}`,
      identityId: item.identityId,
      scheduleId: item.scheduleId ?? null,
      startTime: new Date(item.startTime),
      endTime: new Date(item.endTime),
      sourceRevision: item.sourceRevision,
      idempotencyKey: item.idempotencyKey ?? null,
      status: 'pending',
      attempts: 0,
      lastError: null,
      processedAt: null,
      createdAt: new Date(),
    });
  }

  async fetchPendingRebuildOutbox(): Promise<ScheduleRebuildOutboxDTO[]> {
    return this.outbox;
  }
  async fetchRebuildTimeline(): Promise<ScheduleRebuildOutboxDTO[]> {
    return this.outbox;
  }
  async replayRebuildOutbox(): Promise<ScheduleRebuildOutboxDTO> {
    throw new Error('unused');
  }
  async claimRebuildOutboxItems(): Promise<ScheduleRebuildOutboxDTO[]> {
    return [];
  }
  async markRebuildOutboxProcessed(): Promise<void> {}
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
    const outbox = this.outbox.map((item) => ({ ...item }));
    try {
      return await fn(this);
    } catch (error) {
      this.schedules = schedules;
      this.outbox = outbox;
      throw error;
    }
  }
}

const base = Date.parse('2026-05-02T00:00:00.000Z');
const hour = (h: number) => base + h * 60 * 60 * 1000;
const timed = (start: number, end: number) => ({ kind: 'Timed' as const, start, end });

describe('Schedule services ADR-080', () => {
  it('detectConflictsForTimeRange is analysis-only and does not save', async () => {
    const repository = new InMemoryScheduleRepository();
    const identityId = IdentityId.generate();
    await repository.save(
      CalendarEntry.create({ identityId, title: 'Existing', range: timed(hour(9), hour(10)) }),
    );

    const result = await new ScheduleConflictDetectionService(repository).detectConflictsForTimeRange({
      identityId,
      startTime: hour(9.5),
      endTime: hour(10.5),
    });

    expect(result.hasConflict).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(repository.saveCalls).toBe(1);
  });

  it('creates Timed entries and derives overlap without persisted conflict truth', async () => {
    const repository = new InMemoryScheduleRepository();
    const identityId = IdentityId.generate();
    const service = new ScheduleEventApplicationService(repository);
    const first = await service.createSchedule({
      identityId,
      title: 'First',
      range: timed(hour(9), hour(10)),
    });
    const second = await service.createSchedule({
      identityId,
      title: 'Second',
      range: timed(hour(9.5), hour(10.5)),
    });

    expect(first).not.toHaveProperty('hasConflict');
    expect(second).not.toHaveProperty('conflictingEntries');
    const conflicts = await new ScheduleConflictDetectionService(repository).detectConflictsForTimeRange({
      identityId,
      startTime: hour(9),
      endTime: hour(11),
    });
    expect(conflicts.hasConflict).toBe(true);
    expect(conflicts.conflicts).toHaveLength(2);
    expect(repository.outbox).toHaveLength(2);
  });

  it('creates AllDay entries as Ymd truth without Timed rebuild work', async () => {
    const repository = new InMemoryScheduleRepository();
    const identityId = IdentityId.generate();
    const service = new ScheduleEventApplicationService(repository);
    const created = await service.createSchedule({
      identityId,
      title: 'Holiday',
      range: { kind: 'AllDay', start: requireYmd('2026-05-02'), end: null },
    });

    expect(created.range).toEqual({ kind: 'AllDay', start: '2026-05-02', end: null });
    expect(repository.outbox).toHaveLength(0);
    expect(await service.getSchedulesByAccount(identityId)).toHaveLength(1);
  });

  it('updates metadata and Timed range while deriving current overlap from owner facts', async () => {
    const repository = new InMemoryScheduleRepository();
    const identityId = IdentityId.generate();
    const service = new ScheduleEventApplicationService(repository);
    const first = await service.createSchedule({ identityId, title: 'First', range: timed(hour(9), hour(10)) });
    await service.createSchedule({ identityId, title: 'Second', range: timed(hour(9.5), hour(10.5)) });

    const updated = await service.updateSchedule(first.id, identityId, {
      range: timed(hour(12), hour(13)),
      description: 'Updated notes',
      location: 'Room B',
      attendees: ['a@example.com', 'b@example.com'],
      expectedVersion: first.version,
    });

    expect(updated).toMatchObject({ description: 'Updated notes', location: 'Room B', version: 2 });
    expect(updated.range).toEqual(timed(hour(12), hour(13)));
    const remaining = (await repository.findByIdentityId(identityId)).find(
      (entry) => entry.id !== first.id,
    )!;
    const after = await new ScheduleConflictDetectionService(repository).detectConflictsForEntry(remaining);
    expect(after.hasConflict).toBe(false);
    expect(repository.outbox.at(-1)).toMatchObject({
      scheduleId: first.id,
      sourceRevision: 2,
    });
  });

  it('Timed to AllDay removes the entry from hard-conflict derivation', async () => {
    const repository = new InMemoryScheduleRepository();
    const identityId = IdentityId.generate();
    const service = new ScheduleEventApplicationService(repository);
    const first = await service.createSchedule({ identityId, title: 'First', range: timed(hour(9), hour(10)) });
    await service.createSchedule({ identityId, title: 'Second', range: timed(hour(9.5), hour(10.5)) });

    const before = await new ScheduleConflictDetectionService(repository).detectConflictsForTimeRange({
      identityId,
      startTime: hour(9),
      endTime: hour(11),
    });
    expect(before.hasConflict).toBe(true);

    const updated = await service.updateSchedule(first.id, identityId, {
      range: { kind: 'AllDay', start: requireYmd('2026-05-03'), end: null },
      expectedVersion: first.version,
    });
    expect(updated.range.kind).toBe('AllDay');
    const remaining = (await repository.findByIdentityId(identityId)).find(
      (entry) => entry.id !== first.id,
    )!;
    const after = await new ScheduleConflictDetectionService(repository).detectConflictsForEntry(remaining);
    expect(after.hasConflict).toBe(false);
    expect(repository.outbox).toHaveLength(3);
  });

  it('delete emits a rebuild invalidation and leaves remaining overlap reads correct', async () => {
    const repository = new InMemoryScheduleRepository();
    const identityId = IdentityId.generate();
    const service = new ScheduleEventApplicationService(repository);
    const first = await service.createSchedule({ identityId, title: 'First', range: timed(hour(9), hour(10)) });
    await service.createSchedule({ identityId, title: 'Second', range: timed(hour(9.5), hour(10.5)) });

    await service.deleteSchedule(first.id, identityId, first.version);
    expect(await service.getSchedule(first.id, identityId)).toBeNull();
    const remaining = (await repository.findByIdentityId(identityId)).find(
      (entry) => entry.id !== first.id,
    )!;
    const after = await new ScheduleConflictDetectionService(repository).detectConflictsForEntry(remaining);
    expect(after.hasConflict).toBe(false);
    expect(repository.outbox.at(-1)?.idempotencyKey).toContain(':delete');
  });

  it('rejects cross-identity update/get/delete with NOT_FOUND', async () => {
    const repository = new InMemoryScheduleRepository();
    const service = new ScheduleEventApplicationService(repository);
    const ownerId = IdentityId.generate();
    const otherId = IdentityId.generate();
    const created = await service.createSchedule({ identityId: ownerId, title: 'Owned', range: timed(hour(9), hour(10)) });

    await expect(service.getSchedule(created.id, otherId)).resolves.toBeNull();
    await expect(service.updateSchedule(created.id, otherId, { title: 'Hijacked', expectedVersion: 1 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.deleteSchedule(created.id, otherId, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await service.getSchedule(created.id, ownerId))?.title).toBe('Owned');
  });
});
