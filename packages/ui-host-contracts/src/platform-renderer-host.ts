/**
 * Platform renderer host protocol (M4 / Issue #671 family).
 *
 * Every `*-ui` package owns a domain host port (`GoalUiHost`, `TaskUiHost`, …)
 * whose members are the renderer capabilities its surfaces consume. Before this
 * package each port re-declared the same platform-level capabilities
 * (`useStrictInject`, product time, server-state scope, i18n, keyboard
 * directive, dialog guard, …), which drifted into three incompatible
 * signatures.
 *
 * `PlatformRendererHost` is the single declaration of those platform-level
 * capabilities. Domain hosts extend it and only declare their own DI slots,
 * query keys, stale times and narrow `components` keys.
 *
 * The package is type-only: it has no Vue runtime imports and no component or
 * composable implementations. The only runtime symbol is the binding seam that
 * composes the base once per renderer composition root.
 */
import type {
  Component,
  ComputedRef,
  InjectionKey,
  MaybeRefOrGetter,
  ObjectDirective,
  Ref,
} from 'vue';
import type { QueryClient } from '@tanstack/vue-query';
import type { TimeFacade } from '@memoflow/time';
import type { LabelClientDTO } from '@memoflow/label-contracts';
import type {
  ResultErrorTranslateFn,
  TranslateResultErrorOptions,
} from '@memoflow/http-client';

/** Explicit transition status a business surface publishes to the shell. */
export type PanelSurfaceStatus = 'clean' | 'dirty' | 'busy';

/** Panel width tier: `narrow` is the split layout, `wide` the focused layout. */
export type PanelWidthTier = 'narrow' | 'wide';

/** Panel-measured width context provided by the shell to business views. */
export interface PanelWidthContext {
  /** Current measured content width; `null` until measured or when unmounted. */
  width: Readonly<Ref<number | null>>;
  tier: ComputedRef<PanelWidthTier>;
  isNarrow: ComputedRef<boolean>;
  isWide: ComputedRef<boolean>;
}

/** Label option projection consumed by product pickers and filters. */
export interface PlatformLabelOption {
  readonly id: string;
  readonly name: string;
  readonly color?: string | null;
}

/** Identity-scoped Label catalog shared by product surfaces. */
export interface PlatformLabelCatalog {
  options: Ref<PlatformLabelOption[]>;
  isLoading: Ref<boolean>;
  isCreating: Ref<boolean>;
  createLabel(name: string): Promise<LabelClientDTO>;
  resolveNames(names: readonly string[]): Promise<string[]>;
}

/** Renderer-owned server-state runtime (the QueryClient is the only shared fact). */
export interface PlatformServerStateRuntime {
  queryClient: QueryClient;
}

/**
 * Platform-level renderer capabilities shared by every `*-ui` package.
 *
 * Domain hosts extend this interface and add their own members. The renderer
 * composition root assembles the base once with
 * {@link bindPlatformRendererHost} and spreads it into each domain binding.
 */
export interface PlatformRendererHost {
  // ---- DI & error helpers ----
  useStrictInject<T>(key: InjectionKey<T>, name?: string): T;
  translateResultError(
    error: unknown,
    t: ResultErrorTranslateFn,
    options?: TranslateResultErrorOptions,
  ): string;
  createComposableHandleError(options: {
    t: ResultErrorTranslateFn;
    setError(message: string | null): void;
    report?(message: string): void;
  }): (error: unknown, fallbackKey: string) => void;
  sanitizeForIpc<T>(value: T): T;

  // ---- server state ----
  useServerStateRuntime(): PlatformServerStateRuntime;
  useServerStateIdentityScope(): () => string;

  // ---- shell / dialog / i18n ----
  useDialogCloseGuard(options: {
    dirty: MaybeRefOrGetter<boolean>;
    busy?: MaybeRefOrGetter<boolean>;
    onClose(): void | Promise<void>;
  }): { confirming: Ref<boolean>; requestClose(): Promise<boolean> };
  usePanelSurfaceStatus(status: Ref<PanelSurfaceStatus>): void;
  usePanelWidth(): PanelWidthContext;
  useLabelCatalog(): PlatformLabelCatalog;
  getI18nGlobal(): { t(key: string): string };

  // ---- product time ----
  getProductTime(): TimeFacade;
  productTimeRevision: Readonly<Ref<number>>;
  formatProductDateTime(value: number | string | Date | null | undefined, empty?: string): string;

  // ---- select / keyboard ----
  vKeyboardList: ObjectDirective<HTMLElement>;

  // ---- shared components (domain hosts narrow the key union) ----
  components: Record<string, Component>;
}

/**
 * Renderer capabilities handed to every UI host, bound once per composition
 * root. Holds no user state: every member still consults the host's existing
 * DI, cache, i18n and time owners.
 */
export let platformRendererHost: PlatformRendererHost;

/** Bind the platform base assembled by the renderer composition root. */
export function bindPlatformRendererHost(host: PlatformRendererHost): void {
  platformRendererHost = host;
}

/**
 * Read the bound platform base. Domain binders call this after
 * {@link bindPlatformRendererHost} to spread the base into their own port.
 */
export function getPlatformRendererHost(): PlatformRendererHost {
  if (!platformRendererHost) {
    throw new Error('[ui-host-contracts] PlatformRendererHost is not bound');
  }
  return platformRendererHost;
}
