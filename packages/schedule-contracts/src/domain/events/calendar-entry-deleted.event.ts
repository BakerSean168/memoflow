import type { ScheduleId } from '../../value-objects/schedule-id';

/**
 * Calendar Entry Deleted Event
 *
 * Triggered when a calendar entry is removed from a schedule.
 */
export interface CalendarEntryDeletedEvent {
  entryId: ScheduleId;
}
