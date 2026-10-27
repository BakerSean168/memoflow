import { installRoutineUiHost } from '@schedule-ui-test-host/di/routine-ui-host';
/**
 * Schedule UI test host.
 *
 * The renderer composition root binds this port in production
 * (`packages/app-vue/src/di/schedule-ui-host.ts`). Unit tests reuse the same
 * app-vue implementations through the `@schedule-ui-test-host/*` alias so the
 * package still imports no host internals from production code.
 */
import { defineComponent, h, ref } from 'vue';
import { bindScheduleUiHost, type ScheduleUiHost } from '../schedule-ui-host';
import {
  GOAL_SERVICE_KEY,
  ROUTINE_SERVICE_KEY,
  SCHEDULE_SERVICE_KEY,
} from '@schedule-ui-test-host/di/keys';
import { useStrictInject } from '@schedule-ui-test-host/shared/utils/useStrictInject';
import { sanitizeForIpc } from '@schedule-ui-test-host/shared/utils/ipc/sanitize-for-ipc';
import { createComposableHandleError } from '@schedule-ui-test-host/shared/utils/create-composable-handle-error';
import { useDialogCloseGuard } from '@schedule-ui-test-host/shared/composables/useDialogCloseGuard';
import {
  useServerStateIdentityScope,
  useServerStateRuntime,
} from '@schedule-ui-test-host/platform/server-state/runtime';
import {
  plannerOwnerQueryKeys,
  scheduleCalendarQueryKeys,
} from '@schedule-ui-test-host/platform/server-state/query-keys';
import {
  PLANNER_OWNER_STALE_TIME_MS,
  SCHEDULE_CALENDAR_STALE_TIME_MS,
} from '@schedule-ui-test-host/platform/server-state/query-policy';
import { ok } from '@memoflow/transport-contracts/result';
import { fetchRoutineUpcomingCached } from '@memoflow/routine-ui/composables/routineUpcomingCache';
import { usePanelWidth } from '@schedule-ui-test-host/layouts/shell/usePanelWidth';
import { usePanelSurfaceStatus } from '@schedule-ui-test-host/layouts/shell/usePanelSurfaceStatus';
import {
  endOfDayMs,
  formatProductDateTime,
  getProductTime,
  productTimeRevision,
  startOfDayMs,
} from '@schedule-ui-test-host/shared/utils/product-time';
import { vKeyboardList } from '@schedule-ui-test-host/shared/keyboard/list-adapter';
import {
  ProductDatePicker,
  ProductDateTimePicker,
  ProductDialogShell,
  ProductEditorFrame,
  ProductInlineValidation,
  ProductPropertyChip,
  ProductSurfaceHeader,
  ResponsivePrimaryAction,
} from '@schedule-ui-test-host/shared/components/index.ts';

/**
 * Task presentation is a sibling tier:ui package, which the tier rules forbid
 * Schedule UI from importing. The test host therefore doubles the two Task
 * slots the app-vue composition root binds in production (`useTask` facade and
 * the occurrence quick surface), keeping the published prop/emit contract and
 * component name so slot assertions stay meaningful.
 */
const useTask = () => ({
  instances: ref([]),
  templates: ref([]),
  isLoading: ref(false),
  error: ref(null),
  fetchInstancesByDateRange: async () => undefined,
  fetchTemplates: async () => undefined,
  rescheduleOccurrence: async () => ok(null),
});

export const TaskOccurrenceQuickSurface = defineComponent({
  name: 'TaskOccurrenceQuickSurface',
  props: { occurrenceId: { type: String, required: true } },
  emits: ['open-plan'],
  setup:
    (props, { emit }) =>
    () =>
      h('div', { 'data-testid': 'task-occurrence-quick-surface' }, [
        h('button', {
          type: 'button',
          'data-testid': 'task-open-plan',
          onClick: () => emit('open-plan', props.occurrenceId),
        }),
      ]),
});

export function createScheduleUiTestHost(overrides: Partial<ScheduleUiHost> = {}): ScheduleUiHost {
  return {
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
    ...overrides,
  } as ScheduleUiHost;
}

export function bindDefaultScheduleUiHost(): ScheduleUiHost {
  installRoutineUiHost();
  const host = createScheduleUiTestHost();
  bindScheduleUiHost(host);
  return host;
}

/** Convenience override for specs that only need a narrow panel / no shell store. */
export function withNarrowPanel(isNarrow: boolean): Partial<ScheduleUiHost> {
  return {
    usePanelWidth: () => ({ isNarrow: ref(isNarrow) }),
    usePanelSurfaceStatus: () => undefined,
  };
}
