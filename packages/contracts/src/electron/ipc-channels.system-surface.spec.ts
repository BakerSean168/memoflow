import { describe, expect, it } from 'vitest';
import { DesktopFeatureChannels, SystemChannels } from './ipc-channels';

describe('SystemChannels surface', () => {
  it('does not expose retired lazy-module diagnostics channels', () => {
    expect(SystemChannels).not.toHaveProperty('GET_LAZY_MODULE_STATS');
    expect(Object.values(SystemChannels)).not.toContain('system:getLazyModuleStats');
  });

  it('keeps the active system utility channels', () => {
    expect(SystemChannels.GET_APP_VERSION).toBe('system:getAppVersion');
    expect(SystemChannels.GET_MEMORY_USAGE).toBe('system:getMemoryUsage');
    expect(SystemChannels.GET_IPC_CACHE_STATS).toBe('system:getIpcCacheStats');
    expect(SystemChannels.OPEN_EXTERNAL_URL).toBe('system:openExternalUrl');
  });

  it('keeps all device notification preference channels on the desktop feature surface', () => {
    expect(Object.values(DesktopFeatureChannels)).toEqual(
      expect.arrayContaining([
        DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_GET,
        DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_UPDATE,
        DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_RESET,
      ]),
    );
  });
});
