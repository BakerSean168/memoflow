import { bindGoalUiHost } from '@memoflow/goal-ui/host';
import ActionableWrapper from '../components/shared/ActionableWrapper.vue';
import AppEmptyState from '../components/shared/AppEmptyState.vue';
import ModuleHeader from '../components/shared/ModuleHeader.vue';
import {
  AI_WORKFLOW_RUNTIME_KEY,
  GOAL_DRAFT_CHECKPOINT_KEY,
  GOAL_KNOWLEDGE_SERVICE_KEY,
  GOAL_SERVICE_KEY,
} from '../di/keys';
import { useReferenceableKnowledgeNotes } from '../modules/repository/composables/useReferenceableKnowledgeNotes';
import { useServerStateIdentityScope, useServerStateRuntime } from '../platform/server-state';
import { goalHomeQueryKeys } from '../platform/server-state/query-keys';
import { GOAL_HOME_STALE_TIME_MS } from '../platform/server-state/query-policy';
import { getI18nGlobal } from '../plugins/i18n';
import LabelFilterPopover from '../shared/components/LabelFilterPopover.vue';
import LabelPicker from '../shared/components/LabelPicker.vue';
import PaneScopedDialog from '../shared/components/PaneScopedDialog.vue';
import ProductAutoTextarea from '../shared/components/ProductAutoTextarea.vue';
import ProductDateTimePicker from '../shared/components/ProductDateTimePicker.vue';
import ProductDialogShell from '../shared/components/ProductDialogShell.vue';
import ProductEntityIdentity from '../shared/components/ProductEntityIdentity.vue';
import ProductMetadataRow from '../shared/components/ProductMetadataRow.vue';
import ProductMoreProperties from '../shared/components/ProductMoreProperties.vue';
import ProductPopoverSurface from '../shared/components/ProductPopoverSurface.vue';
import ProductPropertyChip from '../shared/components/ProductPropertyChip.vue';
import ProductSingleSelectFilter from '../shared/components/ProductSingleSelectFilter.vue';
import ProductSurfaceHeader from '../shared/components/ProductSurfaceHeader.vue';
import ProductTimeframePicker from '../shared/components/ProductTimeframePicker.vue';
import ResponsivePrimaryAction from '../shared/components/ResponsivePrimaryAction.vue';
import LabelCommandPanel from '../shared/components/LabelCommandPanel.vue';
import ProductInlineValidation from '../shared/components/ProductInlineValidation.vue';
import { useDialogCloseGuard } from '../shared/composables/useDialogCloseGuard';
import { useLabelCatalog } from '../shared/composables/useLabelCatalog';
import { useTransientFeedback } from '../shared/composables/useTransientFeedback';
import { vKeyboardList } from '../shared/keyboard/list-adapter';
import { subscribeWorkspaceEvents } from '../shared/services/workspace-event-subscription';
import { createComposableHandleError } from '../shared/utils/create-composable-handle-error';
import { sanitizeForIpc } from '../shared/utils/ipc';
import {
  formatProductDate,
  formatProductDateTime,
  formatProductPattern,
  formatProductRelative,
  formatProductYmd,
  getProductTime,
  getProductTodayYmd,
  productTimeRevision,
} from '../shared/utils/product-time';
import { translateResultError } from '../shared/utils/translate-result-error';
import { useStrictInject } from '../shared/utils/useStrictInject';

/** Bind the existing renderer capabilities before mounting Goal surfaces. */
export function installGoalUiHost(): void {
  bindGoalUiHost({
    AI_WORKFLOW_RUNTIME_KEY,
    GOAL_DRAFT_CHECKPOINT_KEY,
    GOAL_HOME_STALE_TIME_MS,
    GOAL_KNOWLEDGE_SERVICE_KEY,
    GOAL_SERVICE_KEY,
    createComposableHandleError,
    formatProductDate,
    formatProductDateTime,
    formatProductPattern,
    formatProductRelative,
    formatProductYmd,
    getI18nGlobal,
    getProductTime,
    getProductTodayYmd,
    goalHomeQueryKeys,
    productTimeRevision,
    sanitizeForIpc,
    subscribeWorkspaceEvents,
    translateResultError,
    useDialogCloseGuard,
    useLabelCatalog,
    useReferenceableKnowledgeNotes,
    useServerStateIdentityScope,
    useServerStateRuntime,
    useStrictInject,
    useTransientFeedback,
    vKeyboardList,
    components: {
      ActionableWrapper,
      AppEmptyState,
      LabelCommandPanel,
      LabelFilterPopover,
      LabelPicker,
      ModuleHeader,
      PaneScopedDialog,
      ProductAutoTextarea,
      ProductDateTimePicker,
      ProductDialogShell,
      ProductEntityIdentity,
      ProductInlineValidation,
      ProductMetadataRow,
      ProductMoreProperties,
      ProductPopoverSurface,
      ProductPropertyChip,
      ProductSingleSelectFilter,
      ProductSurfaceHeader,
      ProductTimeframePicker,
      ResponsivePrimaryAction,
    },
  });
}
