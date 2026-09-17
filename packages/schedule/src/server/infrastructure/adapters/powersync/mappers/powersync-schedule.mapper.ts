import type { CalendarEntryRange } from '@memoflow/contracts/schedule';
import { CalendarEntryRangeSchema } from '@memoflow/contracts/schedule';
import { CalendarEntry } from '../../../../domain/aggregates/calendar-entry';
import type { CalendarEntryState } from '../../../../domain/aggregates/calendar-entry';
import { ScheduleId } from '../../../../domain/value-objects/schedule-id';
import type { IdentityId } from '@memoflow/domain-shared';

export type PowerSyncScheduleRow = {
  id: string;
  identity_id: string;
  title: string;
  description: string | null;
  range_kind: string;
  timed_start: string | null;
  timed_end: string | null;
  all_day_start: string | null;
  all_day_end: string | null;
  // Transitional projection cache columns are intentionally not mapped into CalendarEntry state.
  has_conflict?: number | boolean | null;
  conflicting_schedules?: string | null;
  location: string | null;
  attendees: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export class PowerSyncScheduleMapper {
  private static toRange(data: PowerSyncScheduleRow): CalendarEntryRange {
    if (data.range_kind === 'Timed') {
      if (data.timed_start == null || data.timed_end == null) {
        throw new TypeError(`Timed CalendarEntry '${data.id}' is missing timed range columns`);
      }
      return CalendarEntryRangeSchema.parse({
        kind: 'Timed',
        start: new Date(data.timed_start).getTime(),
        end: new Date(data.timed_end).getTime(),
      });
    }

    if (data.range_kind === 'AllDay') {
      if (data.all_day_start == null) {
        throw new TypeError(`AllDay CalendarEntry '${data.id}' is missing all_day_start`);
      }
      return CalendarEntryRangeSchema.parse({
        kind: 'AllDay',
        start: data.all_day_start,
        end: data.all_day_end,
      });
    }

    throw new TypeError(
      `CalendarEntry '${data.id}' has unsupported range kind '${data.range_kind}'`,
    );
  }

  static toDomain(data: PowerSyncScheduleRow): CalendarEntry {
    const state: CalendarEntryState = {
      id: ScheduleId.of(data.id),
      identityId: data.identity_id as IdentityId,
      title: data.title,
      description: data.description,
      range: PowerSyncScheduleMapper.toRange(data),
      location: data.location,
      attendees: data.attendees ? JSON.parse(data.attendees) : null,
      version: Number(data.version ?? 1),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
    return CalendarEntry.load(state);
  }

  static toPersistence(schedule: CalendarEntry) {
    const range = schedule.range;
    return {
      id: String(schedule.id),
      identityId: schedule.identityId,
      title: schedule.title,
      description: schedule.description ?? null,
      rangeKind: range.kind,
      timedStart: range.kind === 'Timed' ? new Date(range.start).toISOString() : null,
      timedEnd: range.kind === 'Timed' ? new Date(range.end).toISOString() : null,
      allDayStart: range.kind === 'AllDay' ? range.start : null,
      allDayEnd: range.kind === 'AllDay' ? range.end : null,
      location: schedule.location ?? null,
      attendees: schedule.attendees ? JSON.stringify(schedule.attendees) : null,
      version: schedule.version,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    };
  }
}
