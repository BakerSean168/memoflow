import { TimeZoneIdSchema } from '@memoflow/time';
import {
  DEFAULT_USER_PREFERENCE_PROFILE,
  type UserPreferenceProfile,
} from '@memoflow/contracts/setting';
import { setProductTimePreferences } from '@memoflow/app-vue/shared/utils/product-time';

/** Shared isolated-app bootstrap; Goal retains its cross-day timezone contract. */
export function bootstrapVisualApp(params: URLSearchParams, timeZone = 'UTC') {
  const locale = params.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US';
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
  document.documentElement.lang = locale;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  const profile: UserPreferenceProfile = {
    ...DEFAULT_USER_PREFERENCE_PROFILE,
    presentation: { ...DEFAULT_USER_PREFERENCE_PROFILE.presentation, theme, language: locale },
    regional: {
      ...DEFAULT_USER_PREFERENCE_PROFILE.regional,
      timeZone: TimeZoneIdSchema.parse(timeZone),
    },
  };
  setProductTimePreferences(profile);
  return { locale, theme, profile };
}
