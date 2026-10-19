import { describe, expect, it } from 'vitest';
import { resolveDesktopStorageRoots, type DesktopRuntimeChannel } from './desktop-storage-roots';

describe('desktop storage roots', () => {
  for (const channel of ['production', 'development', 'test'] satisfies DesktopRuntimeChannel[]) {
    const name =
      channel === 'production'
        ? 'MemoFlow'
        : `MemoFlow-${channel === 'development' ? 'Dev' : 'Test'}`;
    it(`isolates ${channel} on all platforms, including redirected Known Folders`, () => {
      const windows = resolveDesktopStorageRoots({
        platform: 'win32',
        channel,
        home: 'C:/Users/me',
        env: {},
        knownFolder: (folder) => (folder === 'roamingAppData' ? 'R:/OneDrive/Roaming' : 'L:/Local'),
      });
      expect(windows.configRoot).toBe(`R:\\OneDrive\\Roaming\\${name}`);
      expect(windows.dataRoot).toBe(`L:\\Local\\${name}\\data`);
      expect(windows.stateRoot).toBe(`L:\\Local\\${name}\\state`);
      expect(windows.cacheRoot).toBe(`L:\\Local\\${name}\\cache`);
      const mac = resolveDesktopStorageRoots({
        platform: 'darwin',
        channel,
        home: '/Users/me',
        env: {},
      });
      expect(mac.configRoot).toBe(`/Users/me/Library/Application Support/${name}/config`);
      expect(mac.dataRoot).toBe(`/Users/me/Library/Application Support/${name}/data`);
      expect(mac.stateRoot).toBe(`/Users/me/Library/Application Support/${name}/state`);
      expect(mac.cacheRoot).toBe(`/Users/me/Library/Caches/${name}`);
      expect(mac.logsDir).toBe(`/Users/me/Library/Logs/${name}`);
      const linux = resolveDesktopStorageRoots({
        platform: 'linux',
        channel,
        home: '/home/me',
        env: {},
      });
      expect(linux.configRoot).toBe(`/home/me/.config/${name.toLowerCase()}`);
      expect(linux.electronUserData).toBe(`${linux.configRoot}/electron`);
      expect(linux.electronSessionData).toBe(`${linux.dataRoot}/chromium-session`);
    });
  }
  for (const value of [undefined, '', 'relative/path', '/custom']) {
    it(`validates all XDG variables: ${String(value)}`, () => {
      const roots = resolveDesktopStorageRoots({
        platform: 'linux',
        channel: 'production',
        home: '/home/me',
        env: {
          XDG_CONFIG_HOME: value,
          XDG_DATA_HOME: value,
          XDG_STATE_HOME: value,
          XDG_CACHE_HOME: value,
        },
      });
      expect(roots.configRoot).toBe(`${value === '/custom' ? value : '/home/me/.config'}/memoflow`);
      expect(roots.dataRoot).toBe(
        `${value === '/custom' ? value : '/home/me/.local/share'}/memoflow`,
      );
      expect(roots.stateRoot).toBe(
        `${value === '/custom' ? value : '/home/me/.local/state'}/memoflow`,
      );
      expect(roots.cacheRoot).toBe(`${value === '/custom' ? value : '/home/me/.cache'}/memoflow`);
    });
  }
  it('uses one explicit isolated test root and rejects relative overrides', () => {
    const input = {
      platform: 'linux',
      channel: 'test',
      home: '/home/me',
      env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: '/isolated' },
    } as const;
    const roots = resolveDesktopStorageRoots(input);
    expect([roots.configRoot, roots.dataRoot, roots.stateRoot, roots.cacheRoot]).toEqual([
      '/isolated/config',
      '/isolated/data',
      '/isolated/state',
      '/isolated/cache',
    ]);
    expect(() =>
      resolveDesktopStorageRoots({
        ...input,
        env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: 'relative' },
      }),
    ).toThrow('absolute');
  });
  it('does not guess missing Windows LocalAppData from Roaming', () => {
    expect(() =>
      resolveDesktopStorageRoots({
        platform: 'win32',
        channel: 'production',
        home: 'C:/Users/me',
        env: { APPDATA: 'R:/Roaming', LOCALAPPDATA: 'relative' },
      }),
    ).toThrow('LOCALAPPDATA');
  });
});
