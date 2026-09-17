import { describe, expect, it } from 'vitest';
import { requireYmd } from '@memoflow/contracts/primitives';
import { IdentityId } from '@memoflow/domain-shared';
import type { IScheduleRepository } from '../../domain/repositories/i-schedule-repository';
import { CalendarEntry } from '../../domain/aggregates/calendar-entry';
import { ScheduleConflictDetectionService } from './schedule-conflict-detection-service';
import { ScheduleConflictResolutionService } from './schedule-conflict-resolution-service';
import { ScheduleEventApplicationService } from './schedule-event-application-service';

class InMemoryScheduleRepository implements IScheduleRepository {
  private readonly schedules = new Map<string, CalendarEntry>();
  private readonly projections = new Map<
    string,
    { hasConflict: boolean; conflictingEntries: string[] | null }
  >();

  async save(schedule: CalendarEntry): Promise<void> {
    this.schedules.set(schedule.id, schedule);
  }
  async findByIdForIdentity(identityId: string, id: string): Promise<CalendarEntry | null> {
    const schedule = this.schedules.get(id) ?? null;
    return schedule?.identityId === identityId ? schedule : null;
  }
  async findByIdentityId(identityId: string): Promise<CalendarEntry[]> {
    return Array.from(this.schedules.values()).filter(
      (schedule) => schedule.identityId === identityId,
    );
  }
  async deleteById(_identityId: string, id: string): Promise<void> {
    this.schedules.delete(id);
  }
  async deleteAggregate(entry: CalendarEntry): Promise<void> {
    this.schedules.delete(entry.id);
  }
  async findByTimeRange(
    identityId: string,
    startTime: number,
    endTime: number,
    excludeId?: string,
  ): Promise<CalendarEntry[]> {
    return Array.from(this.schedules.values()).filter((schedule) => {
      if (schedule.identityId !== identityId || schedule.id === excludeId) return false;
      const range = schedule.range;
      return range.kind === 'Timed' && range.start < endTime && range.end > startTime;
    });
  }
  async updateConflictProjection(
    identityId: string,
    id: string,
    hasConflict: boolean,
    conflictingEntries: string[] | null,
  ): Promise<void> {
    const entry = this.schedules.get(id);
    if (entry?.identityId === identityId)
      this.projections.set(id, { hasConflict, conflictingEntries });
  }
  async getConflictProjection(identityId: string, id: string) {
    if ((this.schedules.get(id)?.identityId ?? null) !== identityId) return null;
    return this.projections.get(id) ?? { hasConflict: false, conflictingEntries: null };
  }
  async createRebuildOutbox(): Promise<void> {}
  async fetchPendingRebuildOutbox(): Promise<never[]> {
    return [];
  }
  async fetchRebuildTimeline(): Promise<never[]> {
    return [];
  }
  async replayRebuildOutbox(): Promise<never> {
    throw new Error('unused');
  }
  async claimRebuildOutboxItems(): Promise<never[]> {
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
    return fn(this);
  }
}

const base = Date.parse('2026-05-02T00:00:00.000Z');
const hour = (h: number) => base + h * 60 * 60 * 1000;
const timed = (start: number, end: number) => ({ kind: 'Timed' as const, start, end });

describe('ScheduleConflictResolutionService ADR-080', () => {
  it('creates a Timed schedule and returns derived conflict information separately', async () => {
    const repository = new InMemoryScheduleRepository();
    const identityId = IdentityId.generate();
    await repository.save(
      CalendarEntry.create({ identityId, title: 'Existing', range: timed(hour(9), hour(10)) }),
    );
    const service = new ScheduleConflictResolutionService(
      new ScheduleEventApplicationService(repository),
      new ScheduleConflictDetectionService(repository),
    );

    const result = await service.createWithConflictDetection(
      { name: 'Created', range: timed(hour(9.5), hour(10.5)) },
      identityId,
    );

    expect(result.schedule).not.toHaveProperty('hasConflict');
    expect(result.conflicts.hasConflict).toBe(true);
    expect(result.conflicts.conflicts).toHaveLength(1);
  });

  it('auto-resolves a Timed conflict using canonical range mutation', async () => {
    const repository = new InMemoryScheduleRepository();
    const eventService = new ScheduleEventApplicationService(repository);
    const identityId = IdentityId.generate();
    const first = await eventService.createSchedule({
      identityId,
      title: 'First',
      range: timed(hour(9), hour(10)),
    });
    const second = await eventService.createSchedule({
      identityId,
      title: 'Second',
      range: timed(hour(9.5), hour(10.5)),
    });
    const service = new ScheduleConflictResolutionService(
      eventService,
      new ScheduleConflictDetectionService(repository),
    );

    const result = await service.resolveConflict(second.id, { resolution: 'AUTO' }, identityId);

    expect(result.applied.strategy).toBe('AUTO');
    expect(result.applied.previousStartTime).toBe(
      second.range.kind === 'Timed' ? second.range.start : null,
    );
    expect(result.schedule.range.kind).toBe('Timed');
    expect(result.schedule.range).not.toEqual(second.range);
    expect(result.conflicts.conflicts.some((conflict) => conflict.scheduleId === first.id)).toBe(
      true,
    );
  });

  it('does not invent conflicts for an AllDay CalendarEntry', async () => {
    const repository = new InMemoryScheduleRepository();
    const eventService = new ScheduleEventApplicationService(repository);
    const identityId = IdentityId.generate();
    const entry = await eventService.createSchedule({
      identityId,
      title: 'Holiday',
      range: { kind: 'AllDay', start: requireYmd('2026-05-02'), end: null },
    });
    const service = new ScheduleConflictResolutionService(
      eventService,
      new ScheduleConflictDetectionService(repository),
    );

    const result = await service.resolveConflict(entry.id, { resolution: 'AUTO' }, identityId);
    expect(result.conflicts.hasConflict).toBe(false);
    expect(result.schedule.range.kind).toBe('AllDay');
  });
});
