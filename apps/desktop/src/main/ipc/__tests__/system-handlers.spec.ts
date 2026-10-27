import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopFeatureChannels, SystemChannels } from '@memoflow/desktop-contracts';

const mocks = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  appGetPath: vi.fn(),
  appGetVersion: vi.fn(() => '1.0.0'),
  dialogShowOpenDialog: vi.fn(),
  dialogShowSaveDialog: vi.fn(),
  shellOpenPath: vi.fn(),
  shellOpenExternal: vi.fn(),
  getIpcCache: vi.fn(() => ({
    getStats: () => ({ size: 0, hits: 0, misses: 0, hitRate: 0 }),
  })),
  getSharedPathResolver: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.ipcHandle,
  },
  app: {
    getVersion: mocks.appGetVersion,
    getPath: mocks.appGetPath,
  },
  dialog: {
    showOpenDialog: mocks.dialogShowOpenDialog,
    showSaveDialog: mocks.dialogShowSaveDialog,
  },
  shell: {
    openPath: mocks.shellOpenPath,
    openExternal: mocks.shellOpenExternal,
  },
}));

vi.mock('../../utils', () => ({
  getIpcCache: mocks.getIpcCache,
}));

vi.mock('../../runtime-init', () => ({
  getSharedPathResolver: mocks.getSharedPathResolver,
}));

type RegisteredHandler = (event: unknown, payload?: unknown) => Promise<unknown>;

function getRegisteredHandler(channel: string): RegisteredHandler {
  const entry = mocks.ipcHandle.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel,
  );
  expect(entry, `Expected handler for channel ${channel} to be registered`).toBeTruthy();
  return entry![1] as RegisteredHandler;
}

describe('registerSystemIpcHandlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.getSharedPathResolver.mockReturnValue({
      configDir: path.join(os.tmpdir(), 'dialog-config'),
    });
    mocks.dialogShowOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });
    mocks.dialogShowSaveDialog.mockResolvedValue({
      canceled: true,
      filePath: null,
    });
    mocks.shellOpenPath.mockResolvedValue('');
    mocks.shellOpenExternal.mockResolvedValue(undefined);
  });

  it.each([true, false])(
    'native file IPC uses Downloads when present (%s), cancels without writes, and remembers confirmed files',
    async (hasDownloads) => {
      const home = await fs.mkdtemp(path.join(os.tmpdir(), 'system-file-ipc-'));
      try {
        const downloads = path.join(home, 'Downloads');
        const configDir = path.join(home, 'config');
        if (hasDownloads) await fs.mkdir(downloads);
        mocks.appGetPath.mockImplementation((key: string) =>
          key === 'downloads' ? downloads : home,
        );
        mocks.getSharedPathResolver.mockReturnValue({ configDir });
        const { registerSystemIpcHandlers } = await import('../system-handlers');
        registerSystemIpcHandlers(null, null, null);
        const save = getRegisteredHandler(SystemChannels.USER_FILES_SAVE_TEXT);
        const open = getRegisteredHandler(SystemChannels.USER_FILES_OPEN_TEXT);
        const initial = hasDownloads ? downloads : home;
        const write = vi.spyOn(fs, 'writeFile');
        const mkdir = vi.spyOn(fs, 'mkdir');
        try {
          await expect(
            save({}, { defaultFileName: 'export.json', content: 'saved' }),
          ).resolves.toEqual({ ok: true, data: { canceled: true, filePath: null } });
          await expect(open({})).resolves.toEqual({
            ok: true,
            data: { canceled: true, filePath: null, content: null },
          });
          expect(write).not.toHaveBeenCalled();
          expect(mkdir).not.toHaveBeenCalled();
          expect(mocks.dialogShowSaveDialog).toHaveBeenLastCalledWith({
            defaultPath: path.join(initial, 'export.json'),
            filters: undefined,
          });
          expect(mocks.dialogShowOpenDialog).toHaveBeenLastCalledWith({
            defaultPath: initial,
            properties: ['openFile'],
            filters: undefined,
          });
          expect(await fs.readdir(home)).toEqual(hasDownloads ? ['Downloads'] : []);
          const selected = path.join(home, 'selected.json');
          mocks.dialogShowSaveDialog.mockResolvedValue({ canceled: false, filePath: selected });
          await expect(
            save({}, { defaultFileName: 'export.json', content: 'saved' }),
          ).resolves.toEqual({ ok: true, data: { canceled: false, filePath: selected } });
          expect(await fs.readFile(selected, 'utf8')).toBe('saved');
          const preference = path.join(configDir, 'file-dialog-directory.json');
          expect(JSON.parse(await fs.readFile(preference, 'utf8'))).toBe(home);
          mocks.dialogShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [selected] });
          await expect(open({})).resolves.toEqual({
            ok: true,
            data: { canceled: false, filePath: selected, content: 'saved' },
          });
          expect(JSON.parse(await fs.readFile(preference, 'utf8'))).toBe(home);
          expect(mocks.dialogShowOpenDialog).toHaveBeenLastCalledWith({
            defaultPath: home,
            properties: ['openFile'],
            filters: undefined,
          });
        } finally {
          write.mockRestore();
          mkdir.mockRestore();
        }
      } finally {
        await fs.rm(home, { recursive: true, force: true });
      }
    },
  );

  it('registers all shared system and desktop feature handlers', async () => {
    const { registerSystemIpcHandlers } = await import('../system-handlers');

    registerSystemIpcHandlers(null, null, null);

    const channels = new Set(mocks.ipcHandle.mock.calls.map(([channel]) => channel as string));

    expect(channels).toEqual(
      new Set([...Object.values(SystemChannels), ...Object.values(DesktopFeatureChannels)]),
    );
  });

  it('is idempotent across repeated registration calls', async () => {
    const { registerSystemIpcHandlers } = await import('../system-handlers');

    registerSystemIpcHandlers(null, null, null);
    registerSystemIpcHandlers(null, null, null);

    expect(mocks.ipcHandle).toHaveBeenCalledTimes(
      Object.keys(SystemChannels).length + Object.keys(DesktopFeatureChannels).length,
    );
  });

  it('fails all device preference calls when notification capability is degraded', async () => {
    const { registerSystemIpcHandlers } = await import('../system-handlers');
    registerSystemIpcHandlers(null, null, null);

    for (const channel of [
      DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_GET,
      DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_UPDATE,
      DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_RESET,
    ]) {
      await expect(getRegisteredHandler(channel)({}, {})).resolves.toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' }),
      });
    }
  });

  it('returns SERVICE_UNAVAILABLE instead of leaking an inactive Profile scope exception', async () => {
    const notificationPort = {
      getDevicePreference: vi.fn(() => {
        throw new Error('inactive profile');
      }),
      updateDevicePreference: vi.fn(() => {
        throw new Error('inactive profile');
      }),
      resetDevicePreference: vi.fn(() => {
        throw new Error('inactive profile');
      }),
    } as never;
    const { registerSystemIpcHandlers } = await import('../system-handlers');
    registerSystemIpcHandlers(null, null, null, notificationPort);

    for (const [channel, payload] of [
      [DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_GET, undefined],
      [DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_UPDATE, { soundEnabled: false }],
      [DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_RESET, undefined],
    ] as const) {
      await expect(getRegisteredHandler(channel)({}, payload)).resolves.toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' }),
      });
    }
  });

  it('routes device preference get/update/reset to the notification port', async () => {
    const notificationPort = {
      getDevicePreference: vi.fn(() => ({ presentationMode: 'custom', soundEnabled: true })),
      updateDevicePreference: vi.fn(() => ({ presentationMode: 'native', soundEnabled: false })),
      resetDevicePreference: vi.fn(() => ({ presentationMode: 'custom', soundEnabled: true })),
    } as never;
    const { registerSystemIpcHandlers } = await import('../system-handlers');
    registerSystemIpcHandlers(null, null, null, notificationPort);

    await expect(
      getRegisteredHandler(DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_GET)({}),
    ).resolves.toEqual({ ok: true, data: { presentationMode: 'custom', soundEnabled: true } });
    await expect(
      getRegisteredHandler(DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_UPDATE)(
        {},
        {
          presentationMode: 'native',
        },
      ),
    ).resolves.toEqual({ ok: true, data: { presentationMode: 'native', soundEnabled: false } });
    await expect(
      getRegisteredHandler(DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_RESET)({}),
    ).resolves.toEqual({ ok: true, data: { presentationMode: 'custom', soundEnabled: true } });
  });

  it.each([
    ['invalid presentation mode', { presentationMode: 'system' }],
    ['non-boolean soundEnabled', { soundEnabled: 'yes' }],
    ['unknown field', { typo: true }],
  ])('rejects %s device preference patches without calling the port', async (_, patch) => {
    const updateDevicePreference = vi.fn();
    const notificationPort = {
      updateDevicePreference,
    } as never;
    const { registerSystemIpcHandlers } = await import('../system-handlers');
    registerSystemIpcHandlers(null, null, null, notificationPort);

    await expect(
      getRegisteredHandler(DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_UPDATE)({}, patch),
    ).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    });
    expect(updateDevicePreference).not.toHaveBeenCalled();
  });

  it('opens only HTTP(S) URLs in the external browser', async () => {
    const { registerSystemIpcHandlers } = await import('../system-handlers');
    registerSystemIpcHandlers(null, null, null);

    const handler = getRegisteredHandler(SystemChannels.OPEN_EXTERNAL_URL);
    await expect(
      handler({}, { url: 'https://github.com/apps/memoflow/installations/new' }),
    ).resolves.toEqual({ ok: true, data: { opened: true } });
    expect(mocks.shellOpenExternal).toHaveBeenCalledWith(
      'https://github.com/apps/memoflow/installations/new',
    );

    await expect(handler({}, { url: 'file:///tmp/secret' })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('HTTP(S)'),
      }),
    });
    await expect(handler({}, { url: 'javascript:alert(1)' })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('HTTP(S)'),
      }),
    });
  });
});
