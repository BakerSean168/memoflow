import type { ScheduleId } from '../../value-objects/schedule-id';

/**
 * Calendar Entry Updated Event
 *
 * Triggered when an existing calendar entry is modified.
 */
export interface CalendarEntryUpdatedEvent {
  entryId: ScheduleId;
  changedFields: string[];
}
