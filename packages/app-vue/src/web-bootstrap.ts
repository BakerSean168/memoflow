export { createAppRouter } from './router';

export { useAuthenticationStore } from './modules/authentication/stores/authentication-store';
export { createNotificationStartupHook } from './modules/notification/initialization';
export {
  presentBrowserSystemNotification,
  browserSystemNotificationPermission,
  isBrowserSystemNotificationEnabled,
  isBrowserSystemNotificationSupported,
  requestBrowserSystemNotificationPermission,
  setBrowserSystemNotificationEnabled,
  type BrowserSystemNotificationPermission,
} from './modules/notification/browser-system-notification';
export {
  presentWebLiveNotification,
  type WebLiveNotificationPresenterOptions,
  type WebLiveNotificationPresentation,
} from './modules/notification/web-live-notification';
export { usePresentationPreferenceStore } from './modules/setting/stores/presentation-preference-store';
export { applyThemeMode } from './modules/setting/composables/useThemeSync';
