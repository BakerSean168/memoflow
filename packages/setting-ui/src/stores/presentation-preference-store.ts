import { defineStore } from 'pinia';
import { AccentSchema, type Accent, type UserPreferenceProfile } from '@memoflow/setting-contracts';
import type { SettingLocale } from '../setting-ui-host';
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
  locale: SettingLocale;
  theme: PresentationThemeMode;
  accent: Accent;
}

const DEFAULT_ACCENT: Accent = 'brand-gold';

/** Unknown or legacy accent values fall back to the brand gold. */
export function normalizeAccent(accent: unknown): Accent {
  const parsed = AccentSchema.safeParse(accent);
  return parsed.success ? parsed.data : DEFAULT_ACCENT;
}

export const usePresentationPreferenceStore = defineStore('presentation-preference', {
  state: (): PresentationPreferenceState => ({
    locale: detectBrowserLocale(),
    theme: 'auto',
    accent: DEFAULT_ACCENT,
  }),

  actions: {
    setLocale(locale: SettingLocale) {
      this.locale = normalizeLocale(locale);
    },

    setTheme(theme: PresentationThemeMode) {
      this.theme = normalizeTheme(theme);
    },

    setAccent(accent: Accent | string) {
      this.accent = normalizeAccent(accent);
    },

    syncFromUserPreferenceProfile(profile: UserPreferenceProfile) {
      this.locale = normalizeLocale(profile.presentation.language);
      this.theme = normalizeTheme(profile.presentation.theme);
      this.accent = normalizeAccent(profile.presentation.accent);
    },
  },

  persist: {
    pick: ['locale', 'theme', 'accent'] as Array<keyof PresentationPreferenceState>,
  },
});
