/** Planner/Calendar state container. Temporal Engine worker state is not product UI state. */
import { defineStore } from 'pinia';
import type { CalendarEntryClientDTO } from '@memoflow/contracts/schedule';

export interface ScheduleState {
  calendarEntries: CalendarEntryClientDTO[];
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
}

export const useScheduleStore = defineStore('schedule', {
  state: (): ScheduleState => ({
    calendarEntries: [],
    isLoading: false,
    error: null,
    isInitialized: false,
  }),
  actions: {
    setCalendarEntries(items: CalendarEntryClientDTO[]) { this.calendarEntries = items; },
    setLoading(v: boolean) { this.isLoading = v; },
    setError(e: string | null) { this.error = e; },
    setInitialized(v: boolean) { this.isInitialized = v; },
    reset() { this.$reset(); },
  },
});

export type ScheduleStoreType = ReturnType<typeof useScheduleStore>;
