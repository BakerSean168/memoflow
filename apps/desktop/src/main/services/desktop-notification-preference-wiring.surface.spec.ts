import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const mainDir = resolve(__dirname, '..');

function read(relativePath: string): string {
  return readFileSync(resolve(mainDir, relativePath), 'utf8');
}

describe('SETTING-9206 desktop device preference ownership', () => {
  it('wires NotificationService to the active Profile narrow preference path', () => {
    const lifecycle = read('lifecycle/app-lifecycle.ts');
    const features = read('desktop-features/index.ts');
    const factories = read('capabilities/electron-factories.ts');
    const notification = read('services/notification.service.ts');

    expect(lifecycle).toContain(
      'runtimeManager.getActiveProfileResolver()?.desktopNotificationPreferencePath ?? null',
    );
    expect(features).toContain('resolveDeviceNotificationPreferencePath');
    expect(factories).toContain('resolveDevicePreferencePath: () => string | null');
    expect(notification).toContain(
      'new DesktopNotificationPreferenceStore(resolveDevicePreferencePath)',
    );
  });

  it('keeps window presentation state and UserFiles out of the notification preference owner', () => {
    const paths = read('paths/profile-path-resolver.ts');
    const store = read('services/desktop-notification-preference.store.ts');
    const userFiles = read('paths/user-files-config.ts');

    expect(paths).toContain("mainWindowStatePath: path.join(uiDir, 'main-window-state.json')");
    expect(paths).toContain(
      "desktopNotificationPreferencePath: path.join(uiDir, 'notification-preference.json')",
    );
    expect(store).not.toContain('mainWindowStatePath');
    expect(store).not.toContain('customRootPath');
    expect(userFiles).toContain("const CONFIG_FILENAME = 'user-files-config.json'");
  });
});
