import type { Component, InjectionKey, ObjectDirective, Ref } from 'vue';
import type { QueryClient, QueryKey } from '@tanstack/vue-query';
import type { NotificationClientPort } from '@memoflow/notification-client';
import type { Result } from '@memoflow/transport-contracts';
import type { TimeFacade } from '@memoflow/time';
import type { Ymd } from '@memoflow/shared-primitives';

/** Semantic presentation tone vocabulary owned by the host design system. */
export type NotificationSemanticTone =
  | 'primary'
  | 'info'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'muted';

/** Semantic elevation vocabulary owned by the host design system. */
export type NotificationSemanticElevation =
  | 'inset'
  | 'raised'
  | 'floating'
  | 'floating-interactive';

/** Data-driven menu item consumed by the host `ActionableWrapper`. */
export interface NotificationMenuAction {
  key: string;
  testId?: string;
  label: string;
  icon?: Component;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
  separator?: boolean;
  handler: () => void;
}

/** Typed server-state invalidation intent for the notification feature cache. */
export interface NotificationInvalidationIntent {
  target: 'notification';
  identityScope: string;
  source: 'mutation' | 'event-bus' | 'sse' | 'powersync' | 'reconnect';
  entityId?: string;
  dedupeKey?: string;
}

/**
 * Single owner of `invalidateQueries` in the renderer. The Notification UI only emits
 * typed intents; the host keeps cache ownership.
 */
export interface NotificationInvalidationDispatcher {
  invalidate(intent: NotificationInvalidationIntent): Promise<void>;
}

/** Canonical, transport-safe notification list query used inside the cache key. */
export interface NotificationListQueryKeyInput {
  page: number;
  limit: number;
  type?: string;
  isRead?: boolean;
  archiveState?: 'active' | 'archived' | 'all';
  startDate?: string;
  endDate?: string;
}

/** Frozen notification query key factories owned by the renderer server-state platform. */
export interface NotificationQueryKeys {
  all: readonly unknown[];
  identity(identityScope: string): QueryKey;
  lists(identityScope: string): QueryKey;
  list(identityScope: string, query: NotificationListQueryKeyInput): QueryKey;
  details(identityScope: string): QueryKey;
  detail(identityScope: string, id: string): QueryKey;
  unread(identityScope: string): QueryKey;
}

type DateValue = number | string | Date | null | undefined;

/** Renderer composition dependencies. The host retains DI, cache, locale and platform ownership. */
export interface NotificationUiHost {
  NOTIFICATION_SERVICE_KEY: InjectionKey<NotificationClientPort>;
  components: Record<
    | 'ModuleHeader'
    | 'ActionableWrapper'
    | 'ProductSurfaceState'
    | 'ResponsiveSegmentedFilter'
    | 'CapsulePreviewShell'
    | 'CapsulePreviewHeader'
    | 'CapsulePreviewFooter'
    | 'CapsulePreviewState',
    Component
  >;
  menuLabel(key: string): string;
  vKeyboardList: ObjectDirective<HTMLElement>;
  useStrictInject<T>(key: InjectionKey<T>, name?: string): T;
  createComposableHandleError(options: {
    t: (key: string, params?: Record<string, unknown>) => string;
    setError(message: string | null): void;
    report?(message: string): void;
  }): (error: unknown, fallbackKey: string) => void;
  useServerStateRuntime(): {
    queryClient: QueryClient;
    dispatcher: NotificationInvalidationDispatcher;
  };
  useServerStateIdentityScope(): () => string;
  notificationQueryKeys: NotificationQueryKeys;
  canonicalizeNotificationListQuery(
    query?: Partial<NotificationListQueryKeyInput>,
  ): NotificationListQueryKeyInput;
  NOTIFICATION_STALE_TIME_MS: number;
  resultQueryFn<T>(fn: () => Promise<Result<T>>): () => Promise<T>;
  semanticToneSurfaceClass(tone: NotificationSemanticTone): string;
  semanticToneBorderClass(tone: NotificationSemanticTone): string;
  semanticElevationClass(elevation: NotificationSemanticElevation): string;
  getProductTime(): TimeFacade;
  productTimeRevision: Ref<number>;
  formatProductRelative(value: number | null | undefined, empty?: string): string;
}

// Bound once in the renderer composition root. Holds no user state: every function
// still consults the host's existing DI, i18n, time and cache owners.
export let notificationUiHost: NotificationUiHost;
export function bindNotificationUiHost(host: NotificationUiHost): void {
  notificationUiHost = host;
}
