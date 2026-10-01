import { sanitizeForIpc } from '../../../shared/utils/ipc';
import { getProductTime } from '../../../shared/utils/product-time';
import type {
  CalendarEntryClientDTO,
  CreateScheduleRequest,
  UpdateScheduleRequest,
} from '@memoflow/contracts/schedule';
import type { Result } from '@memoflow/contracts/result';
import { fail } from '@memoflow/contracts/result';
import type { ScheduleContext } from './useScheduleContext';
import { useServerStateIdentityScope, useServerStateRuntime } from '../../../platform/server-state';
import { scheduleCalendarQueryKeys } from '../../../platform/server-state/query-keys';
import { SCHEDULE_CALENDAR_STALE_TIME_MS } from '../../../platform/server-state/query-policy';

function overlapsPlannerWindow(
  entry: CalendarEntryClientDTO,
  startTime: number,
  endTime: number,
): boolean {
  if (entry.range.kind === 'Timed') {
    return entry.range.start < endTime && entry.range.end > startTime;
  }

  const time = getProductTime();
  const startDate = String(time.calendar.toYmd(startTime));
  const endDate = String(time.calendar.toYmd(Math.max(startTime, endTime - 1)));
  const entryEnd = entry.range.end ?? entry.range.start;
  return entry.range.start <= endDate && entryEnd >= startDate;
}

export function useScheduleCalendar(ctx: ScheduleContext) {
  const { store, service, handleError } = ctx;
  const runtime = useServerStateRuntime();
  const resolveIdentityScope = useServerStateIdentityScope();

  function patchCachedEntries(
    update: (current: CalendarEntryClientDTO[]) => CalendarEntryClientDTO[],
  ): void {
    runtime.queryClient.setQueryData<CalendarEntryClientDTO[]>(
      scheduleCalendarQueryKeys.entries(resolveIdentityScope()),
      (current) => update(current ?? []),
    );
  }

  async function fetchCalendarEntries(
    startTime: number,
    endTime: number,
    options: { force?: boolean } = {},
  ): Promise<CalendarEntryClientDTO[]> {
    const queryKey = scheduleCalendarQueryKeys.entries(resolveIdentityScope());
    const cachedEntries = runtime.queryClient.getQueryData<CalendarEntryClientDTO[]>(queryKey);
    if (cachedEntries) {
      store.setCalendarEntries(
        cachedEntries.filter((entry) => overlapsPlannerWindow(entry, startTime, endTime)),
      );
    }
    store.setLoading(cachedEntries === undefined);
    store.setError(null);
    try {
      // P4-2301A: cache the owner facts before applying the current Planner-window projection.
      // The cache survives shell Popover unmounts and prevents hover-driven duplicate I/O.
      const allEntries = await runtime.queryClient.fetchQuery<CalendarEntryClientDTO[]>({
        queryKey,
        staleTime: options.force ? 0 : SCHEDULE_CALENDAR_STALE_TIME_MS,
        queryFn: async () => {
          const result = await service.getSchedulesByAccount();
          if (!result.ok) throw result.error;
          return result.data;
        },
      });
      const entries = allEntries.filter((entry) =>
        overlapsPlannerWindow(entry, startTime, endTime),
      );
      store.setCalendarEntries(entries);
      return entries;
    } catch (error) {
      handleError(error, 'schedule.error.loadCalendarEntriesFailed');
      return [];
    } finally {
      store.setLoading(false);
    }
  }

  async function createCalendarEntry(data: CreateScheduleRequest) {
    store.setError(null);
    try {
      const request = sanitizeForIpc(data) as unknown as CreateScheduleRequest;
      const result = data.autoDetectConflicts
        ? await service.createScheduleWithConflictDetection(request)
        : await service.createSchedule(request);

      if (result.ok) {
        const createdEntry = 'schedule' in result.data ? result.data.schedule : result.data;
        store.setCalendarEntries([...store.calendarEntries, createdEntry]);
        patchCachedEntries((current) => [...current, createdEntry]);
        return createdEntry;
      }
      handleError(result.error, 'schedule.error.createCalendarEntryFailed');
      return null;
    } catch (e: unknown) {
      handleError(e, 'schedule.error.createCalendarEntryFailed');
      return null;
    }
  }

  async function updateCalendarEntry(
    id: string,
    data: UpdateScheduleRequest,
  ): Promise<Result<CalendarEntryClientDTO>> {
    store.setError(null);
    try {
      const result = await service.updateSchedule(
        id,
        sanitizeForIpc(data) as unknown as UpdateScheduleRequest,
      );
      if (result.ok) {
        const nextEntries = store.calendarEntries.map((entry) =>
          String(entry.id) === id ? result.data : entry,
        );
        store.setCalendarEntries(nextEntries);
        patchCachedEntries((current) =>
          current.map((entry) => (String(entry.id) === id ? result.data : entry)),
        );
      } else {
        handleError(result.error, 'schedule.error.updateCalendarEntryFailed');
      }
      return result;
    } catch (error: unknown) {
      handleError(error, 'schedule.error.updateCalendarEntryFailed');
      return fail({
        code: 'INTERNAL_ERROR',
        message: 'Failed to update schedule entry',
        cause: error,
      });
    }
  }

  async function deleteCalendarEntry(id: string, expectedVersion?: number) {
    store.setError(null);
    try {
      const entry = store.calendarEntries.find((e) => e.id === id);
      const version = expectedVersion ?? entry?.version;
      if (version === undefined || version === null) {
        throw new Error('Cannot delete schedule entry without a known current version');
      }
      const result = await service.deleteSchedule(id, version);
      if (result.ok) {
        const nextEntries = store.calendarEntries.filter((e) => e.id !== id);
        store.setCalendarEntries(nextEntries);
        patchCachedEntries((current) => current.filter((entry) => String(entry.id) !== id));
        return true;
      }
      handleError(result.error, 'schedule.error.deleteCalendarEntryFailed');
      return false;
    } catch (e: unknown) {
      handleError(e, 'schedule.error.deleteCalendarEntryFailed');
      return false;
    }
  }

  return {
    fetchCalendarEntries,
    createCalendarEntry,
    updateCalendarEntry,
    deleteCalendarEntry,
  };
}
