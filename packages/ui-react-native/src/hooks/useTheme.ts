import { useContext } from 'react';

import { Colors, resolveThemeName } from '../constants/theme';
import { AppThemeNameContext } from '../providers/app-theme-provider';
import { useColorScheme } from './useColorScheme';

export function useTheme() {
  const providedTheme = useContext(AppThemeNameContext);
  const systemScheme = useColorScheme();
  const themeName = providedTheme ?? resolveThemeName(systemScheme);

  return Colors[themeName];
}
