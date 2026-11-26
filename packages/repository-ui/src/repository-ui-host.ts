import type { Component, InjectionKey } from 'vue';
import type { QueryKey } from '@tanstack/vue-query';
import type { KnowledgeDocumentRef } from '@memoflow/repository-contracts';
import type { RepositoryClientPort } from '@memoflow/repository-client';
import type { ElectronBridge } from '@memoflow/ipc-client';
import type { PlatformRendererHost, PlatformServerStateRuntime } from '@memoflow/ui-host-contracts';
import type { KnowledgeCaptureNativeEditSession } from './composables/knowledgeCaptureNativeEditSession';

/** Panel transition status; single declaration lives in the platform contract. */
export type { PanelSurfaceStatus } from '@memoflow/ui-host-contracts';
/** Panel width shape; single declaration lives in the platform contract. */
export type { PanelWidthContext, PanelWidthTier } from '@memoflow/ui-host-contracts';

export interface KnowledgeNativeSurfaceHost {
  openCreate(): Promise<KnowledgeCaptureNativeEditSession>;
  locate(): KnowledgeCaptureNativeEditSession | null;
  register(fullPath: string, session: KnowledgeCaptureNativeEditSession): () => void;
}

/**
 * Renderer composition dependencies. Platform capabilities come from
 * {@link PlatformRendererHost}; this port only declares the Repository slots.
 */
export interface KnowledgeBusinessLink {
  documentId: string;
  subjectType: 'goal';
  subjectId: string;
  title: string;
}

export interface RepositoryUiHost extends PlatformRendererHost {
  REPOSITORY_SERVICE_KEY: InjectionKey<RepositoryClientPort>;
  DESKTOP_BRIDGE_KEY: InjectionKey<ElectronBridge>;
  SERVER_STATE_RUNTIME_KEY: InjectionKey<PlatformServerStateRuntime>;
  SERVER_STATE_IDENTITY_SCOPE_KEY: InjectionKey<() => string>;
  components: {
    ModuleHeader: Component;
    ProductSingleSelectFilter: Component;
    ProductPopoverSurface: Component;
    ProductSurfaceHeader: Component;
    ProductSurfaceState: Component;
    ProductDialogShell: Component;
    ProductSheetSurface: Component;
  };
  useKnowledgeBusinessLinks(): (
    documents: KnowledgeDocumentRef[],
  ) => Promise<KnowledgeBusinessLink[]>;
  stripMarkdownFrontmatter(source: string): string;
  renderSafeMarkdown(source: string): string;
  useKnowledgeNativeSurfaceRegistration(): KnowledgeNativeSurfaceHost | null;
  recentKnowledgeQueryKeys: {
    all: readonly unknown[];
    identity?(identityScope: string): QueryKey;
    list?(identityScope: string, query?: unknown): QueryKey;
    recent(identityScope: string, source: string, limit: number): QueryKey;
  };
  RECENT_KNOWLEDGE_STALE_TIME_MS: number;
}

// Bound once in the renderer composition root. Holds no user state: every function
// still consults the host's existing DI, i18n, time and cache owners.
export let repositoryUiHost: RepositoryUiHost;
export function bindRepositoryUiHost(host: RepositoryUiHost): void {
  repositoryUiHost = host;
}
