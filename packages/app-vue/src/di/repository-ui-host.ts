import { bindRepositoryUiHost } from '@memoflow/repository-ui/host';
import ProductSurfaceHeader from '../shared/components/ProductSurfaceHeader.vue';
import ProductSurfaceState from '../shared/components/ProductSurfaceState.vue';
import ProductDialogShell from '../shared/components/ProductDialogShell.vue';
import ProductSheetSurface from '../shared/components/ProductSheetSurface.vue';
import { vKeyboardList } from '../shared/keyboard/list-adapter';
import { useStrictInject } from '../shared/utils/useStrictInject';
import { translateResultError } from '../shared/utils/translate-result-error';
import { renderSafeMarkdown, stripMarkdownFrontmatter } from '../shared/utils/safe-markdown';
import { useDialogCloseGuard } from '../shared/composables/useDialogCloseGuard';
import { useKnowledgeNativeSurfaceRegistration } from '../layouts/shell/useKnowledgeNativeSurface';
import { usePanelSurfaceStatus } from '../layouts/shell/usePanelSurfaceStatus';
import { usePanelWidth } from '../layouts/shell/usePanelWidth';
import {
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
  useServerStateIdentityScope,
  useServerStateRuntime,
} from '../platform/server-state';
import { recentKnowledgeQueryKeys } from '../platform/server-state/query-keys';
import { RECENT_KNOWLEDGE_STALE_TIME_MS } from '../platform/server-state/query-policy';
import { DESKTOP_BRIDGE_KEY, REPOSITORY_SERVICE_KEY } from './keys';

/** Bind the renderer capabilities the Repository surfaces rely on before mounting them. */
export function installRepositoryUiHost(): void {
  bindRepositoryUiHost({
    REPOSITORY_SERVICE_KEY,
    DESKTOP_BRIDGE_KEY,
    SERVER_STATE_RUNTIME_KEY,
    SERVER_STATE_IDENTITY_SCOPE_KEY,
    components: {
      ProductSurfaceHeader,
      ProductSurfaceState,
      ProductDialogShell,
      ProductSheetSurface,
    },
    vKeyboardList,
    useStrictInject: (key, name) => useStrictInject(key, name),
    translateResultError: (...args) => translateResultError(...args),
    stripMarkdownFrontmatter: (s) => stripMarkdownFrontmatter(s),
    renderSafeMarkdown: (s) => renderSafeMarkdown(s),
    useDialogCloseGuard: (options) => useDialogCloseGuard(options),
    useKnowledgeNativeSurfaceRegistration: () => useKnowledgeNativeSurfaceRegistration(),
    usePanelSurfaceStatus: (s) => usePanelSurfaceStatus(s),
    usePanelWidth: () => usePanelWidth(),
    useServerStateRuntime: () => useServerStateRuntime(),
    useServerStateIdentityScope: () => useServerStateIdentityScope(),
    recentKnowledgeQueryKeys,
    RECENT_KNOWLEDGE_STALE_TIME_MS,
  });
}

// Auto-bind on module load in the host renderer composition root
installRepositoryUiHost();
