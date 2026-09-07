/** Planner/Calendar composable. Temporal Engine diagnostics are not product state. */
import { computed } from 'vue';
import { createScheduleContext } from './useScheduleContext';
import { useScheduleCalendar } from './useScheduleCalendar';

export function useSchedule() {
  const ctx = createScheduleContext();
  const calendarOps = useScheduleCalendar(ctx);

  return {
    calendarEntries: computed(() => ctx.store.calendarEntries),
    isLoading: computed(() => ctx.store.isLoading),
    error: computed(() => ctx.store.error),
    fetchCalendarEntries: calendarOps.fetchCalendarEntries,
    createCalendarEntry: calendarOps.createCalendarEntry,
    updateCalendarEntry: calendarOps.updateCalendarEntry,
    deleteCalendarEntry: calendarOps.deleteCalendarEntry,
  };
}
