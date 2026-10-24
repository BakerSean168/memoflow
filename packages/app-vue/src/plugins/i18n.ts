/**
 * Vue I18n Plugin
 *
 * Integrates vue-i18n with the app-vue DI pattern.
 *
 * Host apps are responsible for loading the initial locale messages first,
 * then installing the plugin with those messages.
 *
 * Vue components in app-vue can then use the standard `useI18n()` composable
 * or `$t()` in templates to translate strings.
 *
 * @module plugins/i18n
 */

import { createI18n } from 'vue-i18n';

export type AppLocale = 'zh-CN' | 'en-US';

type LocaleMessages = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyI18n = any;

const localeMessagesCache = new Map<AppLocale, LocaleMessages>();

/**
 * The singleton i18n instance, exported so non-component code
 * (e.g. `menu-labels.ts`, navigation helpers) can read translations.
 *
 * Will be `null` until `createI18nPlugin()` is called.
 */
let _i18n: AnyI18n | null = null;

async function importLocaleMessages(locale: AppLocale): Promise<LocaleMessages> {
  const cached = localeMessagesCache.get(locale);
  if (cached) {
    return cached;
  }

  const messages = (
    await (locale === 'en-US' ? import('../locales/en-US') : import('../locales/zh-CN'))
  ).default as LocaleMessages;

  localeMessagesCache.set(locale, messages);
  return messages;
}

export async function loadLocaleMessages(locale: AppLocale): Promise<LocaleMessages> {
  return importLocaleMessages(locale);
}

/** Get the live i18n instance (throws if not yet initialised). */
export function getI18n(): AnyI18n {
  if (!_i18n) {
    throw new Error('[i18n] Plugin not installed. Call createI18nPlugin() first.');
  }
  return _i18n;
}

/** Convenience: get the global composer (Composition API mode). */
export function getI18nGlobal() {
  return getI18n().global;
}

export function translateMessageKey(messageKey: string): string {
  return String(getI18nGlobal().t(messageKey));
}

/**
 * Creates the Vue I18n plugin.
 *
 * @param locale - Initial locale, defaults to `'zh-CN'`.
 * @param messages - Preloaded messages for the initial locale.
 *
 * @example
 * ```ts
 * // apps/web/src/main.ts
 * import { createI18nPlugin, loadLocaleMessages } from '@memoflow/app-vue';
 *
 * const messages = await loadLocaleMessages('zh-CN');
 * app.use(createI18nPlugin('zh-CN', messages));
 * ```
 */
export function createI18nPlugin(locale: AppLocale = 'zh-CN', messages: LocaleMessages) {
  localeMessagesCache.set(locale, messages);

  const i18n = createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'zh-CN',
    messages: {
      [locale]: messages,
    } as Record<string, any>,
    // Suppress missing-translation warnings in dev for keys not yet migrated
    missingWarn: false,
    fallbackWarn: false,
  });

  _i18n = i18n;

  return i18n;
}

export async function setI18nLocale(locale: AppLocale): Promise<void> {
  const i18n = getI18n();

  if (i18n.global.locale.value === locale) {
    return;
  }

  const messages = await loadLocaleMessages(locale);
  i18n.global.setLocaleMessage(locale, messages);
  i18n.global.locale.value = locale;
}
