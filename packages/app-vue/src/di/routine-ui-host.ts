import { bindRoutineUiHost } from '@memoflow/routine-ui/host';
import AppEmptyState from '../components/shared/AppEmptyState.vue';
import ModuleHeader from '../components/shared/ModuleHeader.vue';
import { ROUTINE_SERVICE_KEY } from '../di/keys';
import { usePanelSurfaceStatus } from '../layouts/shell/usePanelSurfaceStatus';
import { useServerStateIdentityScope, useServerStateRuntime } from '../platform/server-state';
import { routineUpcomingQueryKeys } from '../platform/server-state/query-keys';
import { ROUTINE_UPCOMING_STALE_TIME_MS } from '../platform/server-state/query-policy';
import { CapsulePreviewFooter, CapsulePreviewHeader, CapsulePreviewShell, CapsulePreviewState, ProductAutoTextarea, ProductDatePicker, ProductEditorFrame, ProductInlineValidation, ProductPopoverSurface, ProductPropertyChip, ProductSingleSelectFilter, ProductTimePicker, ProductTimeZoneSelector } from '../shared/components';
import { useDialogCloseGuard } from '../shared/composables/useDialogCloseGuard';
import { useTransientFeedback } from '../shared/composables/useTransientFeedback';
import { vKeyboardList } from '../shared/keyboard/list-adapter';
import { endOfDayMs, formatProductHm, getProductTime, getProductTodayYmd, productTimeRevision, startOfDayMs } from '../shared/utils/product-time';
import { translateResultError } from '../shared/utils/translate-result-error';
import { useStrictInject } from '../shared/utils/useStrictInject';

export function installRoutineUiHost(): void {
  bindRoutineUiHost({
    ROUTINE_SERVICE_KEY,
    ROUTINE_UPCOMING_STALE_TIME_MS,
    endOfDayMs,
    formatProductHm,
    getProductTime,
    getProductTodayYmd,
    productTimeRevision,
    routineUpcomingQueryKeys,
    startOfDayMs,
    translateResultError,
    useDialogCloseGuard,
    usePanelSurfaceStatus,
    useServerStateIdentityScope,
    useServerStateRuntime,
    useStrictInject,
    useTransientFeedback,
    vKeyboardList,
    components: {
      AppEmptyState,
      CapsulePreviewFooter,
      CapsulePreviewHeader,
      CapsulePreviewShell,
      CapsulePreviewState,
      ModuleHeader,
      ProductAutoTextarea,
      ProductDatePicker,
      ProductEditorFrame,
      ProductInlineValidation,
      ProductPopoverSurface,
      ProductPropertyChip,
      ProductSingleSelectFilter,
      ProductTimePicker,
      ProductTimeZoneSelector,
    },
  });
}
