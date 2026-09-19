import type {
  CalendarEntryCreatedEvent,
  CalendarEntryUpdatedEvent,
  CalendarEntryRescheduledEvent,
  CalendarEntryDeletedEvent,
} from '../domain/events';

/** Product Schedule event map. Raw Scheduler runtime events are not product events. */
export type ScheduleEventMap = {
  'schedule:calendar-entry-created': CalendarEntryCreatedEvent;
  'schedule:calendar-entry-updated': CalendarEntryUpdatedEvent;
  'schedule:calendar-entry-rescheduled': CalendarEntryRescheduledEvent;
  'schedule:calendar-entry-deleted': CalendarEntryDeletedEvent;
};
