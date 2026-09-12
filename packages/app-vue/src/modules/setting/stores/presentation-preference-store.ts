import { defineStore } from 'pinia';
import type { UserPreferenceProfile } from '@memoflow/contracts/setting';
import type { AppLocale } from '../../../plugins/i18n';
// Residual 1005: sole presentation helpers (local dual retired).
import {
  detectBrowserLocale,
  normalizeLocale,
  normalizeTheme,
  type PresentationThemeMode,
} from '@memoflow/utils/shared';

export type { PresentationThemeMode };

// Residual 1005: detectBrowserLocale/normalizeLocale/normalizeTheme elevated to @memoflow/utils/shared.

export interface PresentationPreferenceState {
  locale: AppLocale;
  theme: PresentationThemeMode;
}

export const usePresentationPreferenceStore = defineStore('presentation-preference', {
  state: (): PresentationPreferenceState => ({
    locale: detectBrowserLocale(),
    theme: 'auto',
  }),

  actions: {
    setLocale(locale: AppLocale) {
      this.locale = normalizeLocale(locale);
    },

    setTheme(theme: PresentationThemeMode) {
      this.theme = normalizeTheme(theme);
    },

    syncFromUserPreferenceProfile(profile: UserPreferenceProfile) {
      this.locale = normalizeLocale(profile.presentation.language);
      this.theme = normalizeTheme(profile.presentation.theme);
    },
  },

  persist: {
    pick: ['locale', 'theme'] as Array<keyof PresentationPreferenceState>,
  },
});
