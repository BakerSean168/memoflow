import type { ScheduleId } from '@memoflow/shared-primitives';

/**
 * Calendar Entry Deleted Event
 *
 * Triggered when a calendar entry is removed from a schedule.
 */
export interface CalendarEntryDeletedEvent {
  entryId: ScheduleId;
}
