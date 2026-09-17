import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import {
  RoutineWindowChannels,
  type InterventionWindowCommand,
} from '@memoflow/contracts/electron';
import type { InterventionWindowController } from './intervention-window-controller';
import { createInterventionWindowElectronModule } from './intervention-window.electron-module';

function controllerHarness(): InterventionWindowController {
  return {
    present: vi.fn(() => null),
    restoreIdentity: vi.fn(() => null),
    getProjection: vi.fn(() => null),
    execute: vi.fn(async () => null),
    destroy: vi.fn(),
  };
}

describe('InterventionWindow Electron module (ROUTINE-4104)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers only get/command handlers and tears them down with the controller', async () => {
    const controller = controllerHarness();
    const module = createInterventionWindowElectronModule(controller);
    await module.register({} as never);

    expect(ipcMain.handle).toHaveBeenCalledTimes(2);
    expect(ipcMain.handle).toHaveBeenCalledWith(
      RoutineWindowChannels.INTERVENTION_WINDOW_GET,
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(
      RoutineWindowChannels.INTERVENTION_WINDOW_COMMAND,
      expect.any(Function),
    );

    const commandHandler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(
        ([channel]) => channel === RoutineWindowChannels.INTERVENTION_WINDOW_COMMAND,
      )?.[1] as (_event: unknown, command: InterventionWindowCommand) => Promise<unknown>;

    await commandHandler({}, { action: 'snooze', durationMs: 300_000 });
    expect(controller.execute).toHaveBeenCalledWith({ action: 'snooze', durationMs: 300_000 });

    const invalid = (await commandHandler({}, {
      action: 'snooze',
      durationMs: 0,
    } as never)) as { ok: boolean; error?: { code?: string } };
    expect(invalid).toMatchObject({
      ok: false,
      error: { code: 'ROUTINE_INTERVENTION_WINDOW_INVALID_COMMAND' },
    });
    expect(controller.execute).toHaveBeenCalledTimes(1);

    await module.destroy?.();
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(
      RoutineWindowChannels.INTERVENTION_WINDOW_GET,
    );
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(
      RoutineWindowChannels.INTERVENTION_WINDOW_COMMAND,
    );
    expect(controller.destroy).toHaveBeenCalledTimes(1);
  });

  it('returns a stable product error instead of leaking controller exception text', async () => {
    const controller = controllerHarness();
    vi.mocked(controller.execute).mockRejectedValue(new Error('PowerSync secret internal failure'));
    const module = createInterventionWindowElectronModule(controller);
    await module.register({} as never);
    const commandHandler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(
        ([channel]) => channel === RoutineWindowChannels.INTERVENTION_WINDOW_COMMAND,
      )?.[1] as (_event: unknown, command: InterventionWindowCommand) => Promise<unknown>;

    const result = (await commandHandler({}, { action: 'dismiss' })) as {
      ok: boolean;
      error?: { code?: string; message?: string };
    };
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'ROUTINE_INTERVENTION_WINDOW_COMMAND_FAILED',
        message: 'InterventionWindow command failed',
      },
    });
    expect(result.error?.message).not.toContain('PowerSync');
    await module.destroy?.();
  });
});
