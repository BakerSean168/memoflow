import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { RoutineWindowChannels, type FocusWindowCommand } from '@memoflow/contracts/electron';
import type { FocusWindowController } from './focus-window-controller';
import { createFocusWindowElectronModule } from './focus-window.electron-module';

function controllerHarness(): FocusWindowController {
  return {
    open: vi.fn(),
    restoreIdentity: vi.fn(),
    getProjection: vi.fn(() => null),
    execute: vi.fn(async () => null),
    destroy: vi.fn(),
  };
}

describe('FocusWindow Electron module', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers isolated Routine channels and tears them down with the controller', async () => {
    const controller = controllerHarness();
    const module = createFocusWindowElectronModule(controller);
    await module.register({} as never);

    expect(ipcMain.handle).toHaveBeenCalledTimes(2);
    expect(ipcMain.handle).toHaveBeenCalledWith(
      RoutineWindowChannels.FOCUS_WINDOW_GET,
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(
      RoutineWindowChannels.FOCUS_WINDOW_COMMAND,
      expect.any(Function),
    );

    const commandHandler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(
        ([channel]) => channel === RoutineWindowChannels.FOCUS_WINDOW_COMMAND,
      )?.[1] as (_event: unknown, command: FocusWindowCommand) => Promise<unknown>;
    await commandHandler({}, { action: 'hide' });
    expect(controller.execute).toHaveBeenCalledWith({ action: 'hide' });

    const invalid = (await commandHandler({}, {
      action: 'collapse',
      collapsed: 'yes',
    } as never)) as {
      ok: boolean;
      error?: { code?: string };
    };
    expect(invalid).toMatchObject({
      ok: false,
      error: { code: 'ROUTINE_FOCUS_WINDOW_INVALID_COMMAND' },
    });
    expect(controller.execute).toHaveBeenCalledTimes(1);

    await module.destroy?.();
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(RoutineWindowChannels.FOCUS_WINDOW_GET);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(RoutineWindowChannels.FOCUS_WINDOW_COMMAND);
    expect(controller.destroy).toHaveBeenCalledTimes(1);
  });
});
