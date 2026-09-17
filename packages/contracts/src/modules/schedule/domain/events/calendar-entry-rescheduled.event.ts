import type { ScheduleId } from '../../../../primitives';
import type { CalendarEntryRange } from '../../calendar-entry-range';

/** Emitted when a CalendarEntry moves between canonical Timed/AllDay ranges. */
export interface CalendarEntryRescheduledEvent {
  entryId: ScheduleId;
  oldRange: CalendarEntryRange;
  newRange: CalendarEntryRange;
}
