/** Prisma Schedule (CalendarEntry) Mapper — ADR-080 range truth. */

import type { Schedule as PrismaSchedule } from '@memoflow/database';
import type { CalendarEntryRange } from '@memoflow/contracts/schedule';
import { CalendarEntryRangeSchema } from '@memoflow/contracts/schedule';
import { CalendarEntry } from '../../../../domain/aggregates/calendar-entry';
import type { CalendarEntryState } from '../../../../domain/aggregates/calendar-entry';
import { ScheduleId } from '../../../../domain/value-objects/schedule-id';
import type { IdentityId } from '@memoflow/domain-shared';

export class PrismaScheduleMapper {
  private static toRange(data: PrismaSchedule): CalendarEntryRange {
    if (data.rangeKind === 'Timed') {
      if (data.timedStart == null || data.timedEnd == null) {
        throw new TypeError(`Timed CalendarEntry '${data.id}' is missing timed range columns`);
      }
      return CalendarEntryRangeSchema.parse({
        kind: 'Timed',
        start: data.timedStart.getTime(),
        end: data.timedEnd.getTime(),
      });
    }

    if (data.rangeKind === 'AllDay') {
      if (data.allDayStart == null) {
        throw new TypeError(`AllDay CalendarEntry '${data.id}' is missing all_day_start`);
      }
      return CalendarEntryRangeSchema.parse({
        kind: 'AllDay',
        start: data.allDayStart,
        end: data.allDayEnd,
      });
    }

    throw new TypeError(
      `CalendarEntry '${data.id}' has unsupported range kind '${data.rangeKind}'`,
    );
  }

  static toDomain(data: PrismaSchedule): CalendarEntry {
    const state: CalendarEntryState = {
      id: ScheduleId.of(data.id),
      identityId: data.identityId as IdentityId,
      title: data.title,
      description: data.description,
      range: PrismaScheduleMapper.toRange(data),
      location: data.location,
      attendees: data.attendees ? JSON.parse(data.attendees) : null,
      version: data.version ?? 1,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
    return CalendarEntry.load(state);
  }

  static toPersistence(schedule: CalendarEntry) {
    const range = schedule.range;
    return {
      id: schedule.id,
      identityId: schedule.identityId,
      title: schedule.title,
      description: schedule.description ?? null,
      rangeKind: range.kind,
      timedStart: range.kind === 'Timed' ? new Date(range.start) : null,
      timedEnd: range.kind === 'Timed' ? new Date(range.end) : null,
      allDayStart: range.kind === 'AllDay' ? range.start : null,
      allDayEnd: range.kind === 'AllDay' ? range.end : null,
      location: schedule.location ?? null,
      attendees: schedule.attendees ? JSON.stringify(schedule.attendees) : null,
      version: schedule.version,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    };
  }

  static toDomainList(rows: PrismaSchedule[]): CalendarEntry[] {
    return rows.map((row) => PrismaScheduleMapper.toDomain(row));
  }
}
