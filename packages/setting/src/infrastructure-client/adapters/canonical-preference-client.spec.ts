import { describe, expect, it, vi } from 'vitest';
import { SettingChannels } from '@memoflow/contracts/electron';
import { SettingHttpAdapter } from './http/setting-http.adapter';
import { SettingIpcAdapter } from './ipc/setting-ipc.adapter';

const ok = <T>(data: T) => ({ ok: true as const, data });

describe('canonical preference transport clients', () => {
  it('HTTP adapter uses owner-specific preference routes and expectedRevision bodies', async () => {
    const http = {
      get: vi.fn().mockResolvedValue(ok({})),
      post: vi.fn().mockResolvedValue(ok({})),
      put: vi.fn(),
      patch: vi.fn().mockResolvedValue(ok({})),
      delete: vi.fn(),
      stream: vi.fn(),
    };
    const adapter = new SettingHttpAdapter(http);

    await adapter.getPreferenceProfile();
    await adapter.getPreferenceNamespace('regional');
    await adapter.patchPreferenceNamespace('regional', { timeZone: 'Asia/Tokyo' }, 3);
    await adapter.resetPreferenceNamespace('presentation', 2);
    await adapter.resetUserPreferences({ presentation: 2, regional: 4 });

    expect(http.get).toHaveBeenNthCalledWith(1, '/settings/preferences');
    expect(http.get).toHaveBeenNthCalledWith(2, '/settings/preferences/regional');
    expect(http.patch).toHaveBeenCalledWith('/settings/preferences/regional', {
      patch: { timeZone: 'Asia/Tokyo' },
      expectedRevision: 3,
    });
    expect(http.post).toHaveBeenNthCalledWith(1, '/settings/preferences/presentation/reset', {
      expectedRevision: 2,
    });
    expect(http.post).toHaveBeenNthCalledWith(2, '/settings/preferences/reset-all', {
      expectedRevisions: { presentation: 2, regional: 4 },
    });
  });

  it('IPC adapter uses canonical SettingChannels with the same typed payloads', async () => {
    const ipc = { invoke: vi.fn().mockResolvedValue(ok({})) };
    const adapter = new SettingIpcAdapter(ipc);

    await adapter.getPreferenceProfile();
    await adapter.patchPreferenceNamespace('presentation', { theme: 'dark' }, 1);
    await adapter.resetPreferenceNamespace('regional', 5);

    expect(ipc.invoke).toHaveBeenNthCalledWith(1, SettingChannels.PREFERENCES_PROFILE_GET);
    expect(ipc.invoke).toHaveBeenNthCalledWith(2, SettingChannels.PREFERENCE_PATCH, {
      namespace: 'presentation',
      body: { patch: { theme: 'dark' }, expectedRevision: 1 },
    });
    expect(ipc.invoke).toHaveBeenNthCalledWith(3, SettingChannels.PREFERENCE_RESET, {
      namespace: 'regional',
      body: { expectedRevision: 5 },
    });
  });
});
