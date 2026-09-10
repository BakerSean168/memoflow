import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const reactSettings = readFileSync(
  resolve(__dirname, '../../../../../app-react/src/screens/SettingsScreen.tsx'),
  'utf8',
);
const reactPreferenceProvider = readFileSync(
  resolve(__dirname, '../../../../../app-react/src/providers/app-preference-provider.tsx'),
  'utf8',
);
const notificationHook = readFileSync(
  resolve(__dirname, '../../../../../app-react/src/hooks/useNotificationPreferences.ts'),
  'utf8',
);
const mobileRoute = readFileSync(
  resolve(__dirname, '../../../../../../apps/mobile/src/app/explore/settings.tsx'),
  'utf8',
);

describe('React/Mobile Settings owner parity', () => {
  it('keeps Mobile on the shared React Settings screen', () => {
    expect(mobileRoute).toContain("export { SettingsScreen as default } from '@memoflow/app-react'");
  });

  it('uses canonical presentation/regional namespaces rather than legacy UserSetting categories', () => {
    expect(reactPreferenceProvider).toContain("getPreferenceNamespace('presentation')");
    expect(reactPreferenceProvider).toContain("getPreferenceNamespace('regional')");
    expect(reactSettings).not.toContain('useSettings');
    expect(reactSettings).not.toContain('patchCategory');
    expect(reactSettings).not.toContain('resetCategory');
    expect(reactSettings).not.toContain('legacySettings');
  });

  it('uses NotificationPreference owner channels and excludes Desktop-local sound/presentation state', () => {
    expect(reactSettings).toContain('useNotificationPreferences');
    expect(notificationHook).toContain('service.getPreferences()');
    expect(notificationHook).toContain('service.updatePreferences({');
    expect(reactSettings).toContain('NotificationChannelType.Email');
    expect(reactSettings).toContain('NotificationChannelType.Push');
    expect(reactSettings).toContain('NotificationChannelType.InApp');
    expect(reactSettings).not.toContain('Toggle sound');
    expect(reactSettings).not.toContain("toggleNotification('sound')");
    expect(reactSettings).not.toContain('owner cutover');
  });
});
