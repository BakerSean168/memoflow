/**
 * Notification UI - Public Exports
 *
 * @module notification-ui
 */

// Store (UI state only: page/pageSize/readFilter; server state lives in the query cache)
export { useNotificationStore } from './stores/notification-store';
export type { NotificationStoreType, NotificationReadFilter } from './stores/notification-store';

// Composables (Query Cache authority pilot)
export {
  useNotificationListQuery,
  useNotificationUnreadQuery,
  useNotificationMutations,
  type UseNotificationListQueryOptions,
} from './composables';
export {
  useNotificationPreferences,
  NOTIFICATION_PREFERENCE_MODULES,
  type NotificationPreferenceModule,
  type PreferenceChannelFlag,
} from './composables/useNotificationPreferences';

// Routes
export { notificationRoutes } from './router';
export { default as NotificationListPage } from './views/NotificationListPage.vue';

// Initialization (event sources → dispatcher only; Step 3)
export {
  createNotificationStartupHook,
  type NotificationStartupHookOptions,
} from './initialization';
export {
  createNotificationSseInvalidationSource,
  type NotificationSseInvalidationSourceOptions,
  type NotificationSseCursorStore,
} from './initialization/notification-sse-invalidation-source';
export { createNotificationClickNavigation } from './desktop/notification-click-navigation';

// Device / live presentation of an already-created InApp Notification fact
export {
  browserSystemNotificationPermission,
  browserSystemNotificationTargetUrl,
  isBrowserSystemNotificationEnabled,
  isBrowserSystemNotificationSupported,
  presentBrowserSystemNotification,
  requestBrowserSystemNotificationPermission,
  setBrowserSystemNotificationEnabled,
  type BrowserSystemNotificationPermission,
} from './browser-system-notification';
export {
  presentWebLiveNotification,
  type WebLiveNotificationPresentation,
  type WebLiveNotificationPresenterOptions,
} from './web-live-notification';

// Destination policy shared by inbox, web and desktop presentations
export {
  hasNotificationExternalDestination,
  resolveNotificationDestination,
  type NotificationDestination,
  type NotificationDestinationInput,
} from './notification-destination';

// Components
export * from './components';
