/**
 * Schedule UI host binding (renderer composition root).
 *
 * `@memoflow/schedule-ui` owns the Schedule surfaces but must not import
 * `@memoflow/app-vue`: DI keys, server-state runtime, product time, shared
 * presentation components and cross-domain facades stay owned here. This module
 * is the single place where those implementations are handed to the package.
 *
 * Unlike the other domain binders this one has no module-load side effect: the
 * composition root calls {@link installScheduleUiHost} explicitly.
 */
import { bindScheduleUiHost } from '@memoflow/schedule-ui/host';
import {
  ProductDatePicker,
  ProductDateTimePicker,
  ProductDialogShell,
  ProductEditorFrame,
  ProductInlineValidation,
  ProductPropertyChip,
  ProductSurfaceHeader,
  ResponsivePrimaryAction,
} from '../shared/components';
import { endOfDayMs, startOfDayMs } from '../shared/utils/product-time';
import {
  plannerOwnerQueryKeys,
  scheduleCalendarQueryKeys,
} from '../platform/server-state/query-keys';
import {
  PLANNER_OWNER_STALE_TIME_MS,
  SCHEDULE_CALENDAR_STALE_TIME_MS,
} from '../platform/server-state/query-policy';
import { useTask } from '@memoflow/task-ui';
import { fetchRoutineUpcomingCached } from '@memoflow/routine-ui/composables/routineUpcomingCache';
import { TaskOccurrenceQuickSurface } from '@memoflow/task-ui';
import { GOAL_SERVICE_KEY, ROUTINE_SERVICE_KEY, SCHEDULE_SERVICE_KEY } from './keys';
import { installPlatformRendererHost } from './platform-ui-host';

/** Bind the renderer capabilities the Schedule surfaces rely on before mounting them. */
export function installScheduleUiHost(): void {
  bindScheduleUiHost({
    ...installPlatformRendererHost(),
    SCHEDULE_SERVICE_KEY,
    GOAL_SERVICE_KEY,
    ROUTINE_SERVICE_KEY,
    scheduleCalendarQueryKeys,
    plannerOwnerQueryKeys,
    SCHEDULE_CALENDAR_STALE_TIME_MS,
    PLANNER_OWNER_STALE_TIME_MS,
    useTask,
    fetchRoutineUpcomingCached,
    startOfDayMs,
    endOfDayMs,
    components: {
      ProductSurfaceHeader,
      ResponsivePrimaryAction,
      ProductDialogShell,
      ProductDatePicker,
      ProductDateTimePicker,
      ProductEditorFrame,
      ProductInlineValidation,
      ProductPropertyChip,
      TaskOccurrenceQuickSurface,
    },
  });
}
