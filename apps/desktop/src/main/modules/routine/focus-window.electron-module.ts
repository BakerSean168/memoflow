import { ipcMain } from 'electron';
import {
  FocusWindowCommandSchema,
  RoutineWindowChannels,
  type IElectronModule,
} from '@memoflow/contracts/electron';
import { error, ok } from '@memoflow/contracts/result';
import type { FocusWindowController } from './focus-window-controller';

export function createFocusWindowElectronModule(
  controller: FocusWindowController,
): IElectronModule {
  return {
    name: 'routine-focus-window',
    async register() {
      ipcMain.removeHandler(RoutineWindowChannels.FOCUS_WINDOW_GET);
      ipcMain.removeHandler(RoutineWindowChannels.FOCUS_WINDOW_COMMAND);
      ipcMain.handle(RoutineWindowChannels.FOCUS_WINDOW_GET, async () =>
        ok(controller.getProjection()),
      );
      ipcMain.handle(
        RoutineWindowChannels.FOCUS_WINDOW_COMMAND,
        async (_event, command: unknown) => {
          const parsed = FocusWindowCommandSchema.safeParse(command);
          if (!parsed.success) {
            return error('ROUTINE_FOCUS_WINDOW_INVALID_COMMAND', 'Invalid FocusWindow command');
          }
          try {
            return ok(await controller.execute(parsed.data));
          } catch (cause) {
            return error(
              'ROUTINE_FOCUS_WINDOW_COMMAND_FAILED',
              cause instanceof Error ? cause.message : String(cause),
            );
          }
        },
      );
    },
    async destroy() {
      ipcMain.removeHandler(RoutineWindowChannels.FOCUS_WINDOW_GET);
      ipcMain.removeHandler(RoutineWindowChannels.FOCUS_WINDOW_COMMAND);
      controller.destroy();
    },
  };
}
