import { bindTaskUiHost } from '@memoflow/task-ui/host';
import {
  DESKTOP_AUTH_API_KEY,
  GOAL_SERVICE_KEY,
  TASK_SERVICE_KEY,
} from './keys';
import {
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
  createTestServerStateRuntime,
  useServerStateIdentityScope,
  useServerStateRuntime,
} from '../platform/server-state';
import {
  canonicalizeTaskPlanListQuery,
  taskOccurrenceQueryKeys,
  taskPlanQueryKeys,
} from '../platform/server-state/query-keys';
import {
  TASK_OCCURRENCE_STALE_TIME_MS,
  TASK_TEMPLATE_STALE_TIME_MS,
} from '../platform/server-state/query-policy';
import { clearDialogDrafts, useDialogDraftStore } from '../layouts/shell/dialog-draft-store';
import { usePanelSurfaceStatus } from '../layouts/shell/usePanelSurfaceStatus';
import { useTaskNativeSurfaceRegistration } from '../layouts/shell/useTaskNativeSurface';
import { getI18nGlobal } from '../plugins/i18n';
import ActionableWrapper from '../components/shared/ActionableWrapper.vue';
import AppEmptyState from '../components/shared/AppEmptyState.vue';
import ModuleHeader from '../components/shared/ModuleHeader.vue';
import CapsulePreviewFooter from '../shared/components/CapsulePreviewFooter.vue';
import CapsulePreviewHeader from '../shared/components/CapsulePreviewHeader.vue';
import CapsulePreviewShell from '../shared/components/CapsulePreviewShell.vue';
import CapsulePreviewState from '../shared/components/CapsulePreviewState.vue';
import LabelCommandPanel from '../shared/components/LabelCommandPanel.vue';
import LabelFilterPopover from '../shared/components/LabelFilterPopover.vue';
import LabelPicker from '../shared/components/LabelPicker.vue';
import ProductAutoTextarea from '../shared/components/ProductAutoTextarea.vue';
import ProductDatePicker from '../shared/components/ProductDatePicker.vue';
import ProductDateTimePicker from '../shared/components/ProductDateTimePicker.vue';
import ProductDialogShell from '../shared/components/ProductDialogShell.vue';
import ProductEditorFrame from '../shared/components/ProductEditorFrame.vue';
import ProductEntityIdentity from '../shared/components/ProductEntityIdentity.vue';
import ProductInlineValidation from '../shared/components/ProductInlineValidation.vue';
import ProductMetadataRow from '../shared/components/ProductMetadataRow.vue';
import ProductMoreProperties from '../shared/components/ProductMoreProperties.vue';
import ProductPropertyChip from '../shared/components/ProductPropertyChip.vue';
import ProductSingleSelectFilter from '../shared/components/ProductSingleSelectFilter.vue';
import ProductSurfaceHeader from '../shared/components/ProductSurfaceHeader.vue';
import ResponsivePrimaryAction from '../shared/components/ResponsivePrimaryAction.vue';
import { GoalRecordComposerSurface } from '@memoflow/goal-ui';
import { getKeyResultCalculationLabel, getKeyResultRecordPromptLabel, KEY_RESULT_CALCULATION_PRESENTATION } from '@memoflow/goal-ui';
import type { InjectionKey } from 'vue';
import type { TaskUiGoalBindingPort } from '@memoflow/task-ui/host';
import { useDialogCloseGuard } from '../shared/composables/useDialogCloseGuard';
import { useLabelCatalog } from '../shared/composables/useLabelCatalog';
import { vKeyboardList } from '../shared/keyboard/list-adapter';
import { createComposableHandleError } from '../shared/utils/create-composable-handle-error';
import { executeDesktopAuthenticatedResult } from '../shared/utils/execute-desktop-authenticated-result';
import { sanitizeForIpc } from '../shared/utils/ipc';
import { handleCalendarSelect } from '../shared/utils/handle-calendar-select';
import { normalizeSelectString } from '../shared/utils/normalize-select-string';
import {
  endOfDayMs,
  formatProductDate,
  formatProductDateTime,
  formatProductYmd,
  getProductTime,
  getProductTodayYmd,
  isSameDayMs,
  isTodayMs,
  productTimeRevision,
  startOfDayMs,
} from '../shared/utils/product-time';
import { useStrictInject } from '../shared/utils/useStrictInject';

/**
 * Bind the renderer-owned Task capabilities before mounting Task surfaces.
 * 在挂载 Task 视图前绑定渲染器持有的 Task 能力。
 *
 * The goal-binding port (裁决二) wraps the real Goal service; task-ui consumes
 * only DTO-shaped reads through it and never imports goal-ui internals.
 */
export function installTaskUiHost(): void {
  bindTaskUiHost({
    TASK_SERVICE_KEY,
    // 裁决二: task-ui reads goals through its DTO-shaped binding port; the
    // renderer registers the full Goal service (GoalClientPort satisfies it).
    GOAL_SERVICE_KEY: GOAL_SERVICE_KEY as unknown as InjectionKey<TaskUiGoalBindingPort>,
    DESKTOP_AUTH_API_KEY,
    SERVER_STATE_RUNTIME_KEY,
    SERVER_STATE_IDENTITY_SCOPE_KEY,
    useServerStateRuntime,
    useServerStateIdentityScope,
    createTestServerStateRuntime,
    taskPlanQueryKeys,
    taskOccurrenceQueryKeys,
    canonicalizeTaskPlanListQuery,
    TASK_TEMPLATE_STALE_TIME_MS,
    TASK_OCCURRENCE_STALE_TIME_MS,
    useStrictInject,
    sanitizeForIpc,
    createComposableHandleError,
    executeDesktopAuthenticatedResult,
    useDialogCloseGuard,
    useDialogDraftStore,
    clearDialogDrafts,
    useLabelCatalog,
    getI18nGlobal,
    usePanelSurfaceStatus,
    useTaskNativeSurfaceRegistration,
    normalizeSelectString,
    handleCalendarSelect,
    vKeyboardList,
    getProductTime,
    getProductTodayYmd,
    productTimeRevision,
    formatProductDate,
    formatProductDateTime,
    formatProductYmd,
    startOfDayMs,
    endOfDayMs,
    isSameDayMs,
    isTodayMs,
    getKeyResultCalculationLabel,
    getKeyResultRecordPromptLabel,
    KEY_RESULT_CALCULATION_PRESENTATION,
    components: {
      ActionableWrapper,
      AppEmptyState,
      CapsulePreviewFooter,
      CapsulePreviewHeader,
      CapsulePreviewShell,
      CapsulePreviewState,
      GoalRecordComposerSurface,
      LabelCommandPanel,
      LabelFilterPopover,
      LabelPicker,
      ModuleHeader,
      ProductAutoTextarea,
      ProductDatePicker,
      ProductDateTimePicker,
      ProductDialogShell,
      ProductEditorFrame,
      ProductEntityIdentity,
      ProductInlineValidation,
      ProductMetadataRow,
      ProductMoreProperties,
      ProductPropertyChip,
      ProductSingleSelectFilter,
      ProductSurfaceHeader,
      ResponsivePrimaryAction,
    },
  });
}
