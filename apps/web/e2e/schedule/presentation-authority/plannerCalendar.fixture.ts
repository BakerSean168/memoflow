import { computed, ref } from 'vue';
import { useSchedule } from '@memoflow/app-vue/modules/schedule/composables/useSchedule';
import { projectCalendarEntry } from '@memoflow/app-vue/modules/schedule/planner/calendar-event-projection';
export { toLocalDateKey } from './useCalendarView.fixture';

// Only the owner aggregation read is doubled; CRUD uses the production Schedule composable.
export function useCalendarView() {
  const schedule = useSchedule();
  const windowStart = ref<number | null>(null);
  const windowEnd = ref<number | null>(null);
  let loaded = false;
  return {
    projections: computed(() => schedule.calendarEntries.value.map(projectCalendarEntry)),
    conflicts: ref([]),
    isLoading: schedule.isLoading,
    windowStart,
    windowEnd,
    async fetchForRange(start: number, end: number) {
      windowStart.value = start;
      windowEnd.value = end;
      if (loaded && new URLSearchParams(location.search).has('refreshFailure')) {
        throw new Error('Service-double planner refresh failure');
      }
      await schedule.fetchCalendarEntries(start, end);
      loaded = true;
    },
  };
}
