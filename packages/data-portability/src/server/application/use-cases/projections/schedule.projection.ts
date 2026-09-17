/**
 * Schedule Module — Export Projections
 */

import type { ExportContext } from '../../portable-runtime';
import type { PortableSchedule } from '@memoflow/contracts/data-portability';
import { toDateString, toStringArray } from './projection-helpers';

export function projectCalendarEntries(entries: unknown[], ctx: ExportContext): PortableSchedule[] {
  return entries.map((e) => {
    const entity = e as Record<string, unknown>;
    const ref = ctx.refAllocator.allocate('calendarEntry');
    ctx.refToIdMap.set(entity.id as string, ref);
    if (entity.rangeKind !== 'Timed') {
      throw new Error(
        `Portable Schedule V3 cannot represent ${String(entity.rangeKind)} CalendarEntry '${String(entity.id)}' without losing Ymd semantics`,
      );
    }
    const startTime = toDateString(entity.timedStart);
    const endTime = toDateString(entity.timedEnd);
    if (startTime == null || endTime == null) {
      throw new Error(
        `Timed CalendarEntry '${String(entity.id)}' is missing canonical timed range columns`,
      );
    }
    const startMs = Date.parse(startTime);
    const endMs = Date.parse(endTime);
    return {
      _ref: ref,
      title: entity.title as string,
      description: entity.description as string | null | undefined,
      startTime,
      endTime,
      duration: Math.max(0, Math.round((endMs - startMs) / 60000)),
      location: entity.location as string | null | undefined,
      attendees: entity.attendees == null ? undefined : toStringArray(entity.attendees),
      createdAt: toDateString(entity.createdAt),
      updatedAt: toDateString(entity.updatedAt),
    };
  });
}
