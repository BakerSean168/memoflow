export { createAppRouter } from './router';

export { useAuthenticationStore } from './modules/authentication/stores/authentication-store';
export { createNotificationStartupHook } from '@memoflow/notification-ui';
export {
  presentBrowserSystemNotification,
  browserSystemNotificationPermission,
  isBrowserSystemNotificationEnabled,
  isBrowserSystemNotificationSupported,
  requestBrowserSystemNotificationPermission,
  setBrowserSystemNotificationEnabled,
  type BrowserSystemNotificationPermission,
} from '@memoflow/notification-ui';
export {
  presentWebLiveNotification,
  type WebLiveNotificationPresenterOptions,
  type WebLiveNotificationPresentation,
} from '@memoflow/notification-ui';
export { usePresentationPreferenceStore } from './modules/setting/stores/presentation-preference-store';
export { applyThemeMode } from './modules/setting/composables/useThemeSync';
