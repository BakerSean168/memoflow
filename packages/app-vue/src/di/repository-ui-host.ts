import ModuleHeader from '../components/shared/ModuleHeader.vue';
import ProductSingleSelectFilter from '../shared/components/ProductSingleSelectFilter.vue';
import ProductPopoverSurface from '../shared/components/ProductPopoverSurface.vue';
import { useKnowledgeBusinessLinks } from './use-knowledge-business-links';
import { bindRepositoryUiHost } from '@memoflow/repository-ui/host';
import ProductSurfaceHeader from '../shared/components/ProductSurfaceHeader.vue';
import ProductSurfaceState from '../shared/components/ProductSurfaceState.vue';
import ProductDialogShell from '../shared/components/ProductDialogShell.vue';
import ProductSheetSurface from '../shared/components/ProductSheetSurface.vue';
import { renderSafeMarkdown, stripMarkdownFrontmatter } from '../shared/utils/safe-markdown';
import { useKnowledgeNativeSurfaceRegistration } from '../layouts/shell/useKnowledgeNativeSurface';
import {
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
} from '../platform/server-state';
import { recentKnowledgeQueryKeys } from '../platform/server-state/query-keys';
import { RECENT_KNOWLEDGE_STALE_TIME_MS } from '../platform/server-state/query-policy';
import { DESKTOP_BRIDGE_KEY, REPOSITORY_SERVICE_KEY } from './keys';
import { installPlatformRendererHost } from './platform-ui-host';

/** Bind the renderer capabilities the Repository surfaces rely on before mounting them. */
export function installRepositoryUiHost(): void {
  bindRepositoryUiHost({
    ...installPlatformRendererHost(),
    REPOSITORY_SERVICE_KEY,
    DESKTOP_BRIDGE_KEY,
    SERVER_STATE_RUNTIME_KEY,
    SERVER_STATE_IDENTITY_SCOPE_KEY,
    components: {
      ModuleHeader,
      ProductSingleSelectFilter,
      ProductPopoverSurface,
      ProductSurfaceHeader,
      ProductSurfaceState,
      ProductDialogShell,
      ProductSheetSurface,
    },
    useKnowledgeBusinessLinks,
    stripMarkdownFrontmatter,
    renderSafeMarkdown,
    useKnowledgeNativeSurfaceRegistration,
    recentKnowledgeQueryKeys,
    RECENT_KNOWLEDGE_STALE_TIME_MS,
  });
}

// Auto-bind on module load in the host renderer composition root
installRepositoryUiHost();
