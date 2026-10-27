import { bindNotificationUiHost } from '@memoflow/notification-ui/host';
import ActionableWrapper from '../components/shared/ActionableWrapper.vue';
import { menuLabel } from '../components/shared/menu-labels';
import ModuleHeader from '../components/shared/ModuleHeader.vue';
import CapsulePreviewFooter from '../shared/components/CapsulePreviewFooter.vue';
import CapsulePreviewHeader from '../shared/components/CapsulePreviewHeader.vue';
import CapsulePreviewShell from '../shared/components/CapsulePreviewShell.vue';
import CapsulePreviewState from '../shared/components/CapsulePreviewState.vue';
import ProductSurfaceState from '../shared/components/ProductSurfaceState.vue';
import ResponsiveSegmentedFilter from '../shared/components/ResponsiveSegmentedFilter.vue';
import { semanticElevationClass } from '../shared/constants/semantic-elevation';
import {
  semanticToneBorderClass,
  semanticToneSurfaceClass,
} from '../shared/constants/semantic-tone';
import { vKeyboardList } from '../shared/keyboard/list-adapter';
import { createComposableHandleError } from '../shared/utils/create-composable-handle-error';
import {
  formatProductRelative,
  getProductTime,
  productTimeRevision,
} from '../shared/utils/product-time';
import { useStrictInject } from '../shared/utils/useStrictInject';
import { useServerStateIdentityScope, useServerStateRuntime } from '../platform/server-state';
import {
  canonicalizeNotificationListQuery,
  notificationQueryKeys,
} from '../platform/server-state/query-keys';
import { NOTIFICATION_STALE_TIME_MS } from '../platform/server-state/query-policy';
import { resultQueryFn } from '../platform/server-state/result-query';
import { NOTIFICATION_SERVICE_KEY } from './keys';

/** Bind the renderer capabilities the Notification surfaces rely on before mounting them. */
export function installNotificationUiHost(): void {
  bindNotificationUiHost({
    NOTIFICATION_SERVICE_KEY,
    components: {
      ActionableWrapper,
      CapsulePreviewFooter,
      CapsulePreviewHeader,
      CapsulePreviewShell,
      CapsulePreviewState,
      ModuleHeader,
      ProductSurfaceState,
      ResponsiveSegmentedFilter,
    },
    menuLabel,
    vKeyboardList,
    useStrictInject,
    createComposableHandleError,
    useServerStateRuntime,
    useServerStateIdentityScope,
    notificationQueryKeys,
    canonicalizeNotificationListQuery,
    NOTIFICATION_STALE_TIME_MS,
    resultQueryFn,
    semanticToneSurfaceClass,
    semanticToneBorderClass,
    semanticElevationClass,
    getProductTime,
    productTimeRevision,
    formatProductRelative,
  });
}
