import { ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { createContext, type PropsWithChildren } from 'react';

import { getNavigationTheme, resolveThemeName, type AppThemeName } from '../constants/theme';
import { useColorScheme } from '../hooks/useColorScheme';

export type AppThemeMode = 'auto' | AppThemeName;

export const AppThemeNameContext = createContext<AppThemeName | null>(null);

export function AppThemeProvider({
  children,
  themeMode = 'auto',
}: PropsWithChildren<{ themeMode?: AppThemeMode }>) {
  const systemScheme = useColorScheme();
  const themeName = themeMode === 'auto' ? resolveThemeName(systemScheme) : themeMode;
  const navigationTheme = getNavigationTheme(themeName);

  return (
    <AppThemeNameContext.Provider value={themeName}>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style={themeName === 'dark' ? 'light' : 'dark'} />
        {children}
      </ThemeProvider>
    </AppThemeNameContext.Provider>
  );
}
