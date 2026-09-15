import type { PropsWithChildren } from 'react';

import { AppThemeProvider } from '@memoflow/ui-react-native';

import { AppClientRegistryProvider } from './app-client-registry-provider';
import { AppPreferenceProvider, useAppPreferences } from './app-preference-provider';
import { AppSessionProvider } from './app-session-provider';

function CanonicalThemeBoundary({ children }: PropsWithChildren) {
  const { profile } = useAppPreferences();
  return <AppThemeProvider themeMode={profile?.presentation.theme ?? 'auto'}>{children}</AppThemeProvider>;
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AppSessionProvider>
      <AppClientRegistryProvider>
        <AppPreferenceProvider>
          <CanonicalThemeBoundary>{children}</CanonicalThemeBoundary>
        </AppPreferenceProvider>
      </AppClientRegistryProvider>
    </AppSessionProvider>
  );
}
