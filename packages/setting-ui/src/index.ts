/**
 * Setting Module - Public Exports
 *
 * @module modules/setting
 */

// Store
export { usePresentationPreferenceStore } from './stores/presentation-preference-store';
export type {
  PresentationPreferenceState,
  PresentationThemeMode,
} from './stores/presentation-preference-store';

// Composables
export {
  usePreferencePortability,
  usePresentationBootstrap,
  useLocaleSync,
  useThemeSync,
  applyThemeMode,
} from './composables';

// Routes
export { settingRoutes } from './router';
export { default as UserSettingsView } from './views/UserSettingsView.vue';

// Components
export * from './components';
export { useUserPreferences } from './composables/useUserPreferences';
