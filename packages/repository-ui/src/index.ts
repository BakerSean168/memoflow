/**
 * Repository UI Module - Public Exports
 *
 * Live surfaces: Local Vault (Desktop) and GitHub knowledge projections (Web).
 * Legacy database Repository/Resource editing is intentionally absent.
 *
 * @module repository-ui
 */

// Composables
export * from './composables';

// Routes
export { repositoryRoutes } from './router';

// Views
export { default as RepositoryEntryView } from './views/RepositoryEntryView.vue';
export { default as LocalVaultWorkspaceView } from './views/LocalVaultWorkspaceView.vue';
export { default as KnowledgeProjectionWorkspaceView } from './views/KnowledgeProjectionWorkspaceView.vue';

// Components
export * from './components';

// Host
export {
  repositoryUiHost,
  bindRepositoryUiHost,
  type RepositoryUiHost,
  type PanelSurfaceStatus,
  type PanelWidthTier,
  type PanelWidthContext,
} from './repository-ui-host';
