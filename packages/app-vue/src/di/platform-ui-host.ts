/**
 * Platform host assembly (M4).
 *
 * Every `*-ui` package now consumes {@link PlatformRendererHost} from
 * `@memoflow/ui-host-contracts`. This module is the single place where the
 * renderer's platform implementations are handed over; domain binders spread
 * the returned base and add their own slots.
 */
import {
  bindPlatformRendererHost,
  type PlatformRendererHost,
} from '@memoflow/ui-host-contracts';
import { useDialogCloseGuard } from '../shared/composables/useDialogCloseGuard';
import { useLabelCatalog } from '../shared/composables/useLabelCatalog';
import { vKeyboardList } from '../shared/keyboard/list-adapter';
import { usePanelSurfaceStatus } from '../layouts/shell/usePanelSurfaceStatus';
import { usePanelWidth } from '../layouts/shell/usePanelWidth';
import { getI18nGlobal } from '../plugins/i18n';
import { useServerStateIdentityScope, useServerStateRuntime } from '../platform/server-state';
import { createComposableHandleError } from '../shared/utils/create-composable-handle-error';
import { sanitizeForIpc } from '../shared/utils/ipc';
import {
  formatProductDateTime,
  getProductTime,
  productTimeRevision,
} from '../shared/utils/product-time';
import { translateResultError } from '../shared/utils/translate-result-error';
import { useStrictInject } from '../shared/utils/useStrictInject';

/**
 * Assemble the platform capabilities exactly as the renderer owns them. Holds
 * no user state: each member delegates to the host's existing DI, cache, i18n,
 * time and keyboard owners.
 */
export function createPlatformRendererHost(): PlatformRendererHost {
  return {
    useStrictInject,
    translateResultError,
    createComposableHandleError,
    sanitizeForIpc,
    useServerStateRuntime,
    useServerStateIdentityScope,
    useDialogCloseGuard,
    usePanelSurfaceStatus,
    usePanelWidth,
    useLabelCatalog,
    getI18nGlobal,
    getProductTime,
    productTimeRevision,
    formatProductDateTime,
    vKeyboardList,
    components: {},
  };
}

/**
 * Bind the platform base and return it. Domain binders call this first, then
 * spread the result into their own port so a single install() call is enough.
 */
export function installPlatformRendererHost(): PlatformRendererHost {
  const host = createPlatformRendererHost();
  bindPlatformRendererHost(host);
  return host;
}
