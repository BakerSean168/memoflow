/**
 * Schedule UI host binding (renderer composition root).
 *
 * `@memoflow/schedule-ui` owns the Schedule surfaces but must not import
 * `@memoflow/app-vue`: DI keys, server-state runtime, product time, shared
 * presentation components and cross-domain facades stay owned here. This module
 * is the single place where those implementations are handed to the package.
 */
import { bindScheduleUiHost } from '@memoflow/schedule-ui';
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
import { vKeyboardList } from '../shared/keyboard/list-adapter';
import { useDialogCloseGuard } from '../shared/composables/useDialogCloseGuard';
import { createComposableHandleError } from '../shared/utils/create-composable-handle-error';
import { sanitizeForIpc } from '../shared/utils/ipc/sanitize-for-ipc';
import { useStrictInject } from '../shared/utils/useStrictInject';
import {
  endOfDayMs,
  formatProductDateTime,
  getProductTime,
  productTimeRevision,
  startOfDayMs,
} from '../shared/utils/product-time';
import {
  useServerStateIdentityScope,
  useServerStateRuntime,
} from '../platform/server-state/runtime';
import {
  plannerOwnerQueryKeys,
  scheduleCalendarQueryKeys,
} from '../platform/server-state/query-keys';
import {
  PLANNER_OWNER_STALE_TIME_MS,
  SCHEDULE_CALENDAR_STALE_TIME_MS,
} from '../platform/server-state/query-policy';
import { usePanelWidth } from '../layouts/shell/usePanelWidth';
import { usePanelSurfaceStatus } from '../layouts/shell/usePanelSurfaceStatus';
import { useTask } from '@memoflow/task-ui';
import { fetchRoutineUpcomingCached } from '../modules/routine/composables/routineUpcomingCache';
import { TaskOccurrenceQuickSurface } from '@memoflow/task-ui';
import { GOAL_SERVICE_KEY, ROUTINE_SERVICE_KEY, SCHEDULE_SERVICE_KEY } from './keys';

bindScheduleUiHost({
  SCHEDULE_SERVICE_KEY,
  GOAL_SERVICE_KEY,
  ROUTINE_SERVICE_KEY,
  useStrictInject,
  sanitizeForIpc,
  createComposableHandleError,
  useDialogCloseGuard,
  useServerStateRuntime,
  useServerStateIdentityScope,
  scheduleCalendarQueryKeys,
  plannerOwnerQueryKeys,
  SCHEDULE_CALENDAR_STALE_TIME_MS,
  PLANNER_OWNER_STALE_TIME_MS,
  useTask,
  fetchRoutineUpcomingCached,
  usePanelWidth,
  usePanelSurfaceStatus,
  getProductTime,
  productTimeRevision,
  startOfDayMs,
  endOfDayMs,
  formatProductDateTime,
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
  vKeyboardList,
});
