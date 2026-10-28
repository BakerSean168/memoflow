import { bindRoutineUiHost } from '@memoflow/routine-ui/host';
import AppEmptyState from '../components/shared/AppEmptyState.vue';
import ModuleHeader from '../components/shared/ModuleHeader.vue';
import { ROUTINE_SERVICE_KEY } from '../di/keys';
import { routineUpcomingQueryKeys } from '../platform/server-state/query-keys';
import { ROUTINE_UPCOMING_STALE_TIME_MS } from '../platform/server-state/query-policy';
import {
  CapsulePreviewFooter,
  CapsulePreviewHeader,
  CapsulePreviewShell,
  CapsulePreviewState,
  ProductAutoTextarea,
  ProductDatePicker,
  ProductEditorFrame,
  ProductInlineValidation,
  ProductPopoverSurface,
  ProductPropertyChip,
  ProductSingleSelectFilter,
  ProductTimePicker,
  ProductTimeZoneSelector,
} from '../shared/components';
import { useTransientFeedback } from '../shared/composables/useTransientFeedback';
import {
  endOfDayMs,
  formatProductHm,
  getProductTodayYmd,
  startOfDayMs,
} from '../shared/utils/product-time';
import { installPlatformRendererHost } from './platform-ui-host';

export function installRoutineUiHost(): void {
  bindRoutineUiHost({
    ...installPlatformRendererHost(),
    ROUTINE_SERVICE_KEY,
    ROUTINE_UPCOMING_STALE_TIME_MS,
    endOfDayMs,
    formatProductHm,
    getProductTodayYmd,
    routineUpcomingQueryKeys,
    startOfDayMs,
    useTransientFeedback,
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
