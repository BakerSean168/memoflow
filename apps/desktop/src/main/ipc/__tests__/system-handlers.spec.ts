import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopFeatureChannels, SystemChannels } from '@memoflow/contracts/electron';

const mocks = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  appGetVersion: vi.fn(() => '1.0.0'),
  dialogShowOpenDialog: vi.fn(),
  dialogShowSaveDialog: vi.fn(),
  shellOpenPath: vi.fn(),
  shellOpenExternal: vi.fn(),
  getIpcCache: vi.fn(() => ({
    getStats: () => ({ size: 0, hits: 0, misses: 0, hitRate: 0 }),
  })),
  getSharedPathResolver: vi.fn(),
  updateUserFilesRootPath: vi.fn(),
  resolveDesktopUserFilesPath: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.ipcHandle,
  },
  app: {
    getVersion: mocks.appGetVersion,
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
  updateUserFilesRootPath: mocks.updateUserFilesRootPath,
}));

vi.mock('../../user-data-path', () => ({
  resolveDesktopUserFilesPath: mocks.resolveDesktopUserFilesPath,
}));

function createSharedResolver(overrides?: Partial<ReturnType<typeof buildSharedResolver>>) {
  return {
    ...buildSharedResolver(),
    ...overrides,
  };
}

function buildSharedResolver() {
  const rootDir = path.join(os.tmpdir(), 'memoflow-user-files');
  return {
    userFilesRootDir: rootDir,
    userFilesExportsDir: path.join(rootDir, 'exports'),
    userFilesDownloadsDir: path.join(rootDir, 'downloads'),
    userFilesAttachmentsDir: path.join(rootDir, 'attachments'),
  };
}

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

    mocks.getSharedPathResolver.mockReturnValue(createSharedResolver());
    mocks.resolveDesktopUserFilesPath.mockReturnValue(
      path.join(os.tmpdir(), 'MemoFlow Files Default'),
    );
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

  it('returns the current user-files path, default path, and custom flag', async () => {
    const currentPath = path.join(os.tmpdir(), 'MemoFlow Files Custom');
    const defaultPath = path.join(os.tmpdir(), 'MemoFlow Files Default');
    mocks.getSharedPathResolver.mockReturnValue(
      createSharedResolver({ userFilesRootDir: currentPath }),
    );
    mocks.resolveDesktopUserFilesPath.mockReturnValue(defaultPath);

    const { registerSystemIpcHandlers } = await import('../system-handlers');
    registerSystemIpcHandlers(null, null, null);

    const handler = getRegisteredHandler(SystemChannels.USER_FILES_GET_PATH);
    const result = await handler({});

    expect(result).toEqual({
      ok: true,
      data: {
        currentPath,
        defaultPath,
        isCustom: true,
      },
    });
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
      getRegisteredHandler(DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_UPDATE)({}, {
        presentationMode: 'native',
      }),
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

  it('updates the runtime user-files root when a new directory is selected', async () => {
    const selectedPath = path.join(os.tmpdir(), 'MemoFlow Files Picked');
    mocks.dialogShowOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [selectedPath],
    });

    const { registerSystemIpcHandlers } = await import('../system-handlers');
    registerSystemIpcHandlers(null, null, null);

    const handler = getRegisteredHandler(SystemChannels.USER_FILES_PICK_DIRECTORY);
    const result = await handler({});

    expect(mocks.updateUserFilesRootPath).toHaveBeenCalledWith(selectedPath);
    expect(result).toEqual({
      ok: true,
      data: {
        canceled: false,
        path: selectedPath,
      },
    });
  });

  it('does not update the runtime user-files root when the picker is canceled', async () => {
    mocks.dialogShowOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    const { registerSystemIpcHandlers } = await import('../system-handlers');
    registerSystemIpcHandlers(null, null, null);

    const handler = getRegisteredHandler(SystemChannels.USER_FILES_PICK_DIRECTORY);
    const result = await handler({});

    expect(mocks.updateUserFilesRootPath).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      data: {
        canceled: true,
        path: null,
      },
    });
  });

  it('resets the runtime user-files root back to the default path', async () => {
    const defaultPath = path.join(os.tmpdir(), 'MemoFlow Files Default');
    mocks.resolveDesktopUserFilesPath.mockReturnValue(defaultPath);

    const { registerSystemIpcHandlers } = await import('../system-handlers');
    registerSystemIpcHandlers(null, null, null);

    const handler = getRegisteredHandler(SystemChannels.USER_FILES_RESET_PATH);
    const result = await handler({});

    expect(mocks.updateUserFilesRootPath).toHaveBeenCalledWith(null);
    expect(result).toEqual({
      ok: true,
      data: { path: defaultPath },
    });
  });

  it('opens the active user-files root directory in the shell', async () => {
    const currentPath = path.join(os.tmpdir(), 'MemoFlow Files Current');
    mocks.getSharedPathResolver.mockReturnValue(
      createSharedResolver({ userFilesRootDir: currentPath }),
    );

    const { registerSystemIpcHandlers } = await import('../system-handlers');
    registerSystemIpcHandlers(null, null, null);

    const handler = getRegisteredHandler(SystemChannels.USER_FILES_OPEN_DIRECTORY);
    const result = await handler({});

    expect(mocks.shellOpenPath).toHaveBeenCalledWith(currentPath);
    expect(result).toEqual({ ok: true, data: null });
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
