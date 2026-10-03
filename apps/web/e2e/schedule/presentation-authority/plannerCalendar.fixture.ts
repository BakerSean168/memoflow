import { computed, ref } from 'vue';
import { useSchedule } from '@memoflow/app-vue/modules/schedule/composables/useSchedule';
import { useTask } from '@memoflow/app-vue/modules/task/composables/useTask';
import {
  projectCalendarEntry,
  projectTaskOccurrence,
} from '@memoflow/app-vue/modules/schedule/planner/calendar-event-projection';
export { toLocalDateKey } from './useCalendarView.fixture';

// Only owner aggregation is doubled; Schedule and Task reads/actions use production composables.
export function useCalendarView() {
  const schedule = useSchedule();
  const task = ['task-quick', 'collision'].includes(
    new URLSearchParams(location.search).get('surface') ?? '',
  )
    ? useTask()
    : null;
  const windowStart = ref<number | null>(null);
  const windowEnd = ref<number | null>(null);
  let loaded = false;
  return {
    projections: computed(() => [
      ...schedule.calendarEntries.value.map(projectCalendarEntry),
      ...(task?.instances.value ?? []).flatMap((occurrence) => {
        const projection = projectTaskOccurrence(
          occurrence,
          task?.templates.value.find((plan) => plan.id === occurrence.planId),
        );
        return projection ? [projection] : [];
      }),
    ]),
    conflicts: ref([]),
    isLoading: schedule.isLoading,
    windowStart,
    windowEnd,
    async fetchForRange(start: number, end: number, options: { force?: boolean } = {}) {
      windowStart.value = start;
      windowEnd.value = end;
      if (loaded && new URLSearchParams(location.search).has('refreshFailure')) {
        throw new Error('Service-double planner refresh failure');
      }
      await schedule.fetchCalendarEntries(start, end, options);
      if (task)
        await Promise.all([
          task.fetchInstancesByDateRange(start, end, options),
          task.fetchTemplates(),
        ]);
      loaded = true;
    },
  };
}
