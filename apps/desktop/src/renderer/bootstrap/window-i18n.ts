/**
 * Locale bootstrap shared by the standalone Desktop windows.
 *
 * The intervention and custom-notification renderers mount without the
 * authenticated shell (and its Pinia presentation store), so they install the
 * same app-vue i18n plugin directly from the persisted presentation preference.
 */
import type { App } from 'vue';
import { createI18nPlugin, loadLocaleMessages } from '@memoflow/app-vue/plugins/i18n';
import { detectBrowserLocale, normalizeLocale } from '@memoflow/utils/shared';

const PRESENTATION_STORAGE_KEY = 'presentation-preference';

function readWindowLocale() {
  try {
    const raw = window.localStorage.getItem(PRESENTATION_STORAGE_KEY);
    if (!raw) return detectBrowserLocale();
    const parsed = JSON.parse(raw) as { locale?: unknown } | null;
    return normalizeLocale(parsed?.locale);
  } catch {
    return detectBrowserLocale();
  }
}

export async function installWindowI18n(app: App): Promise<void> {
  const locale = readWindowLocale();
  const messages = await loadLocaleMessages(locale);
  app.use(createI18nPlugin(locale, messages));
  document.documentElement.lang = locale;
}
