import type {
  Component,
  ComputedRef,
  InjectionKey,
  MaybeRefOrGetter,
  ObjectDirective,
  Ref,
} from 'vue';
import type { QueryClient, QueryKey } from '@tanstack/vue-query';
import type { RepositoryClientPort } from '@memoflow/repository-client';
import type { translateResultErrorMessage } from '@memoflow/http-client';
export { useStrictInject } from './utils/useStrictInject';

export type PanelSurfaceStatus = 'clean' | 'dirty' | 'busy';
export type PanelWidthTier = 'narrow' | 'wide';

export interface PanelWidthContext {
  width: Readonly<Ref<number | null>>;
  tier: ComputedRef<PanelWidthTier>;
  isNarrow: ComputedRef<boolean>;
  isWide: ComputedRef<boolean>;
}

export interface OwnerNativeEditSession<
  Patch,
  Child,
  ChildId,
  Field,
  State,
  SubmitContext = void,
  SubmitResult = void,
> {
  patch(changes: Patch): void;
  addChild(child: Child): void;
  removeChild(child: ChildId): void;
  focus(field: Field): Promise<void>;
  requestSubmit(context?: SubmitContext): Promise<SubmitResult>;
  requestCancel(): void;
  readDraftState(): State;
}

export interface KnowledgeNativeSurfaceHost {
  openCreate(): Promise<any>;
  locate(): any;
  register(fullPath: string, session: any): () => void;
}

/** Renderer composition dependencies. The host retains DI, cache, locale and platform ownership. */
export interface RepositoryUiHost {
  REPOSITORY_SERVICE_KEY: InjectionKey<RepositoryClientPort>;
  DESKTOP_BRIDGE_KEY: InjectionKey<any>;
  SERVER_STATE_RUNTIME_KEY?: InjectionKey<any>;
  SERVER_STATE_IDENTITY_SCOPE_KEY?: InjectionKey<any>;
  components: {
    ProductSurfaceHeader: Component;
    ProductSurfaceState: Component;
    ProductDialogShell: Component;
    ProductSheetSurface: Component;
  };
  vKeyboardList: ObjectDirective<HTMLElement>;
  useStrictInject<T>(key: InjectionKey<T>, name?: string): T;
  translateResultError: typeof translateResultErrorMessage;
  stripMarkdownFrontmatter(source: string): string;
  renderSafeMarkdown(source: string): string;
  useDialogCloseGuard(options: {
    dirty: MaybeRefOrGetter<boolean>;
    busy?: MaybeRefOrGetter<boolean>;
    onClose(): void | Promise<void>;
  }): { confirming: Ref<boolean>; requestClose(): Promise<boolean> };
  useKnowledgeNativeSurfaceRegistration(): KnowledgeNativeSurfaceHost | null;
  usePanelSurfaceStatus(status: Ref<PanelSurfaceStatus>): void;
  usePanelWidth(): PanelWidthContext;
  useServerStateRuntime(): { queryClient: QueryClient };
  useServerStateIdentityScope(): () => string;
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
