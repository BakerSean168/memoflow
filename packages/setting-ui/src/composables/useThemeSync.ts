import { onScopeDispose, watch } from 'vue';
import { WindowChannels } from '@memoflow/desktop-contracts';
import { usePresentationPreferenceStore } from '../stores/presentation-preference-store';
import { settingUiHost } from '../setting-ui-host';

// Residual 907: inline electronAPI dual retired — DesktopAuthApi sole invoke-api shape.
// Residual 913: host access via getDesktopAuthApi (no Window & electronAPI cast dual).

type ThemeMode = 'light' | 'dark' | 'auto';

const DARK_CLASS = 'dark';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';

function resolveThemeMode(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'auto') {
    return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
  }

  return theme;
}

function syncDesktopWindowChrome(theme: 'light' | 'dark'): void {
  void settingUiHost.getDesktopAuthApi(window)?.invoke?.(WindowChannels.SYNC_CHROME_THEME, theme);
}

export function applyThemeMode(theme: ThemeMode | string | null | undefined): void {
  const safeTheme: ThemeMode =
    theme === 'dark' || theme === 'light' || theme === 'auto' ? theme : 'auto';
  const resolvedTheme = resolveThemeMode(safeTheme);
  const root = document.documentElement;

  root.classList.toggle(DARK_CLASS, resolvedTheme === 'dark');
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
  syncDesktopWindowChrome(resolvedTheme);
}

export function useThemeSync() {
  const store = usePresentationPreferenceStore();
  const mediaQuery = window.matchMedia(MEDIA_QUERY);

  const syncTheme = () => {
    applyThemeMode(store.theme);
  };

  syncTheme();

  watch(() => store.theme, syncTheme);

  const handleSystemThemeChange = () => {
    if (store.theme === 'auto') {
      syncTheme();
    }
  };

  mediaQuery.addEventListener('change', handleSystemThemeChange);
  onScopeDispose(() => {
    mediaQuery.removeEventListener('change', handleSystemThemeChange);
  });

  return {
    syncTheme,
  };
}
