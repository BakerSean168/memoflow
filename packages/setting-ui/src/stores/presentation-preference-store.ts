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
  lightAccent: Accent;
  darkAccent: Accent;
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
    lightAccent: DEFAULT_ACCENT,
    darkAccent: DEFAULT_ACCENT,
  }),

  actions: {
    setLocale(locale: SettingLocale) {
      this.locale = normalizeLocale(locale);
    },

    setTheme(theme: PresentationThemeMode) {
      this.theme = normalizeTheme(theme);
      this.accent = this.resolveActiveAccent();
    },

    setLightAccent(accent: Accent | string) {
      this.lightAccent = normalizeAccent(accent);
      this.accent = this.resolveActiveAccent();
    },

    setDarkAccent(accent: Accent | string) {
      this.darkAccent = normalizeAccent(accent);
      this.accent = this.resolveActiveAccent();
    },

    /**
     * Backward-compatible setter: setting accent sets both light and dark accents,
     * maintaining consistency for single-accent callers/tests.
     */
    setAccent(accent: Accent | string) {
      const normalized = normalizeAccent(accent);
      this.accent = normalized;
      this.lightAccent = normalized;
      this.darkAccent = normalized;
    },

    resolveActiveAccent(resolvedTheme?: 'light' | 'dark'): Accent {
      const currentResolved =
        resolvedTheme ??
        (this.theme === 'dark'
          ? 'dark'
          : this.theme === 'light'
            ? 'light'
            : typeof window !== 'undefined' &&
                window.matchMedia?.('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light');

      return currentResolved === 'dark'
        ? (this.darkAccent ?? this.accent ?? DEFAULT_ACCENT)
        : (this.lightAccent ?? this.accent ?? DEFAULT_ACCENT);
    },

    syncFromUserPreferenceProfile(profile: UserPreferenceProfile) {
      this.locale = normalizeLocale(profile.presentation.language);
      this.theme = normalizeTheme(profile.presentation.theme);
      const fallback = normalizeAccent(profile.presentation.accent);
      this.lightAccent = profile.presentation.lightAccent
        ? normalizeAccent(profile.presentation.lightAccent)
        : fallback;
      this.darkAccent = profile.presentation.darkAccent
        ? normalizeAccent(profile.presentation.darkAccent)
        : fallback;
      this.accent = this.resolveActiveAccent();
    },
  },

  persist: {
    afterHydrate: ({ store }) => {
      store.accent = store.resolveActiveAccent();
    },
    serializer: {
      serialize: (data) => JSON.stringify(data),
      deserialize: (str: string) => {
        const data = JSON.parse(str) as Record<string, unknown>;
        if (data && typeof data === 'object') {
          const fallback = normalizeAccent(data.accent);
          if (!data.lightAccent) data.lightAccent = fallback;
          if (!data.darkAccent) data.darkAccent = fallback;
        }
        return data;
      },
    },
    pick: ['locale', 'theme', 'accent', 'lightAccent', 'darkAccent'] as Array<
      keyof PresentationPreferenceState
    >,
  },
});
