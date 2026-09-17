import { toResultErrorException } from '@memoflow/contracts/result';
import type { CalendarEntryServerDTO, ConflictDetectionResult } from '@memoflow/contracts/schedule';
import type { CalendarEntryState } from '../../domain/aggregates/calendar-entry';
import { CalendarEntry as DomainCalendarEntry } from '../../domain/aggregates/calendar-entry';
import type { IScheduleRepository } from '../../domain/repositories/i-schedule-repository';
import { ScheduleId } from '../../domain/value-objects/schedule-id';
import type { IdentityId } from '@memoflow/domain-shared';

const NO_CONFLICTS: ConflictDetectionResult = {
  hasConflict: false,
  conflicts: [],
  suggestions: [],
};

export class ScheduleConflictDetectionService {
  constructor(private readonly scheduleRepository: IScheduleRepository) {}

  async detectConflictsForSchedule(
    scheduleDto: CalendarEntryServerDTO,
  ): Promise<ConflictDetectionResult> {
    return this.detectConflictsForEntry(this.toAggregate(scheduleDto), scheduleDto.id);
  }

  async detectConflictsForTimeRange(params: {
    identityId: string;
    startTime: number;
    endTime: number;
    excludeId?: string;
  }): Promise<ConflictDetectionResult> {
    const transientEntry = DomainCalendarEntry.load(this.toTransientState(params));
    return this.detectConflictsForEntry(transientEntry, params.excludeId);
  }

  async detectConflictsForEntry(
    schedule: DomainCalendarEntry,
    excludeId: string | undefined = schedule.id,
  ): Promise<ConflictDetectionResult> {
    const range = schedule.range;
    if (range.kind === 'AllDay') return NO_CONFLICTS;
    if (range.start >= range.end) {
      throw toResultErrorException(
        { code: 'VALIDATION_ERROR', message: 'Invalid timed CalendarEntry range' },
        422,
      );
    }

    const overlappingSchedules = await this.scheduleRepository.findByTimeRange(
      schedule.identityId,
      range.start,
      range.end,
      excludeId,
    );
    return schedule.detectConflicts(overlappingSchedules);
  }

  async getScheduleConflicts(
    scheduleId: string,
    identityId: string,
  ): Promise<ConflictDetectionResult> {
    const schedule = await this.scheduleRepository.findByIdForIdentity(identityId, scheduleId);
    if (!schedule) {
      throw toResultErrorException(
        { code: 'NOT_FOUND', message: `Schedule not found: ${scheduleId}` },
        404,
      );
    }
    return this.detectConflictsForEntry(schedule);
  }

  private toAggregate(scheduleDto: CalendarEntryServerDTO): DomainCalendarEntry {
    return DomainCalendarEntry.load({
      id: scheduleDto.id ? ScheduleId.of(scheduleDto.id) : ScheduleId.generate(),
      identityId: scheduleDto.identityId as IdentityId,
      title: scheduleDto.title,
      description: scheduleDto.description ?? null,
      range: scheduleDto.range,
      location: scheduleDto.location ?? null,
      attendees: scheduleDto.attendees ? [...scheduleDto.attendees] : null,
      version: scheduleDto.version ?? 0,
      createdAt: new Date(scheduleDto.createdAt),
      updatedAt: new Date(scheduleDto.updatedAt),
    });
  }

  private toTransientState(params: {
    identityId: string;
    startTime: number;
    endTime: number;
  }): CalendarEntryState {
    const now = new Date();
    return {
      id: ScheduleId.generate(),
      identityId: params.identityId as IdentityId,
      title: 'Conflict check',
      description: null,
      range: { kind: 'Timed', start: params.startTime, end: params.endTime },
      location: null,
      attendees: null,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
  }
}

export default ScheduleConflictDetectionService;
