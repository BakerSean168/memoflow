import { toResultErrorException } from '@memoflow/contracts/result';
import type { CalendarEntryClientDTO, CalendarEntryRange } from '@memoflow/contracts/schedule';
import type { IdentityId } from '@memoflow/domain-shared';
import { CalendarEntry } from '../../domain/aggregates/calendar-entry';
import type { IScheduleRepository } from '../../domain/repositories/i-schedule-repository';

type TimedRange = Extract<CalendarEntryRange, { kind: 'Timed' }>;

function timedRange(range: CalendarEntryRange): TimedRange | null {
  return range.kind === 'Timed' ? range : null;
}

export class ScheduleEventApplicationService {
  constructor(private scheduleRepository: IScheduleRepository) {}

  private static notFound(id: string): never {
    throw toResultErrorException(
      { code: 'NOT_FOUND', message: `Schedule event ${id} not found` },
      404,
    );
  }

  private static invalidVersion(): never {
    throw toResultErrorException(
      {
        code: 'VALIDATION_ERROR',
        message: 'expectedVersion is required and must be a valid number',
      },
      400,
    );
  }

  async createSchedule(params: {
    identityId: string;
    title: string;
    range: CalendarEntryRange;
    description?: string;
    location?: string;
    attendees?: string[];
  }): Promise<CalendarEntryClientDTO> {
    return this.withScheduleRepository(async (scheduleRepository) => {
      const schedule = CalendarEntry.create({
        identityId: params.identityId as IdentityId,
        title: params.title,
        range: params.range,
        description: params.description,
        location: params.location,
        attendees: params.attendees,
      });

      await scheduleRepository.save(schedule);
      await this.enqueueTimedReadRebuild(scheduleRepository, schedule, 'create');
      return schedule.toClientDTO();
    });
  }

  async updateSchedule(
    id: string,
    identityId: string,
    params: {
      title?: string;
      range?: CalendarEntryRange;
      description?: string;
      location?: string;
      attendees?: string[];
      expectedVersion: number;
    },
  ): Promise<CalendarEntryClientDTO> {
    if (params.expectedVersion === undefined || params.expectedVersion === null) {
      ScheduleEventApplicationService.invalidVersion();
    }

    return this.withScheduleRepository(async (scheduleRepository) => {
      const schedule = await scheduleRepository.findByIdForIdentity(identityId, id);
      if (!schedule) ScheduleEventApplicationService.notFound(id);

      if (schedule.version !== params.expectedVersion) {
        throw toResultErrorException(
          {
            code: 'CONFLICT',
            message: `Schedule event ${id} version conflict (expected ${params.expectedVersion}, current version is ${schedule.version})`,
            context: { currentVersion: schedule.version, expectedVersion: params.expectedVersion },
          },
          409,
        );
      }

      const previousRange = schedule.range;
      schedule.update({
        title: params.title,
        description: params.description,
        location: params.location,
        attendees: params.attendees,
        range: params.range,
      });
      await scheduleRepository.save(schedule, params.expectedVersion);
      await this.enqueueChangedTimedReadRebuild(scheduleRepository, schedule, previousRange);
      return schedule.toClientDTO();
    });
  }

  async deleteSchedule(id: string, identityId: string, expectedVersion: number): Promise<void> {
    if (expectedVersion === undefined || expectedVersion === null) {
      ScheduleEventApplicationService.invalidVersion();
    }

    await this.withScheduleRepository(async (scheduleRepository) => {
      const schedule = await scheduleRepository.findByIdForIdentity(identityId, id);
      if (!schedule) ScheduleEventApplicationService.notFound(id);
      if (schedule.version !== expectedVersion) {
        throw toResultErrorException(
          {
            code: 'CONFLICT',
            message: `Schedule event ${id} version conflict (expected ${expectedVersion}, current version is ${schedule.version})`,
            context: { currentVersion: schedule.version, expectedVersion },
          },
          409,
        );
      }

      const deletedRange = schedule.range;
      schedule.delete();
      await scheduleRepository.deleteAggregate(schedule, expectedVersion);
      const timed = timedRange(deletedRange);
      if (timed) {
        await scheduleRepository.createRebuildOutbox({
          identityId: schedule.identityId,
          scheduleId: schedule.id,
          startTime: timed.start,
          endTime: timed.end,
          sourceRevision: schedule.version,
          idempotencyKey: `rebuild:${schedule.identityId}:${schedule.id}:${schedule.version}:delete`,
        });
      }
    });
  }

  async getSchedule(id: string, identityId: string): Promise<CalendarEntryClientDTO | null> {
    const schedule = await this.scheduleRepository.findByIdForIdentity(identityId, id);
    return schedule ? schedule.toClientDTO() : null;
  }

  async getSchedulesByAccount(identityId: string): Promise<CalendarEntryClientDTO[]> {
    return (await this.scheduleRepository.findByIdentityId(identityId)).map((schedule) =>
      schedule.toClientDTO(),
    );
  }

  /** Timed-only compatibility query. AllDay reads use getSchedulesByAccount until P4-2301B Planner projection. */
  async getSchedulesByRange(
    identityId: string,
    startTime: number,
    endTime: number,
  ): Promise<CalendarEntryClientDTO[]> {
    const schedules = await this.scheduleRepository.findByTimeRange(identityId, startTime, endTime);
    return schedules.map((schedule) => schedule.toClientDTO());
  }

  /**
   * Preserve the versioned rebuild operation as a reliability/invalidation signal while
   * P4-2301B removes persisted conflict truth. The rebuild worker now validates the
   * derived read model only; it never writes conflict columns back into CalendarEntry.
   */
  private async enqueueTimedReadRebuild(
    repository: IScheduleRepository,
    schedule: CalendarEntry,
    operation: 'create' | 'update',
  ): Promise<void> {
    const range = timedRange(schedule.range);
    if (!range) return;
    await repository.createRebuildOutbox({
      identityId: schedule.identityId,
      scheduleId: schedule.id,
      startTime: range.start,
      endTime: range.end,
      sourceRevision: schedule.version,
      idempotencyKey: `rebuild:${schedule.identityId}:${schedule.id}:${schedule.version}:${operation}`,
    });
  }

  private async enqueueChangedTimedReadRebuild(
    repository: IScheduleRepository,
    schedule: CalendarEntry,
    previousRange: CalendarEntryRange,
  ): Promise<void> {
    const before = timedRange(previousRange);
    const after = timedRange(schedule.range);
    if (!before && !after) return;

    const start = before && after ? Math.min(before.start, after.start) : (before ?? after!).start;
    const end = before && after ? Math.max(before.end, after.end) : (before ?? after!).end;
    await repository.createRebuildOutbox({
      identityId: schedule.identityId,
      scheduleId: schedule.id,
      startTime: start,
      endTime: end,
      sourceRevision: schedule.version,
      idempotencyKey: `rebuild:${schedule.identityId}:${schedule.id}:${schedule.version}:update`,
    });
  }

  private async withScheduleRepository<T>(
    work: (scheduleRepository: IScheduleRepository) => Promise<T>,
  ): Promise<T> {
    if (!this.scheduleRepository.withTransaction) {
      throw new Error('PowerSync / Schedule repository must provide withTransaction');
    }
    return this.scheduleRepository.withTransaction((scheduleRepository) =>
      work(scheduleRepository),
    );
  }
}
