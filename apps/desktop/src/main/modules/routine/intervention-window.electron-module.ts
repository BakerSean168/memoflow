import { ipcMain } from 'electron';
import {
  InterventionWindowCommandSchema,
  RoutineWindowChannels,
  type IElectronModule,
} from '@memoflow/contracts/electron';
import { error, ok } from '@memoflow/contracts/result';
import type { InterventionWindowController } from './intervention-window-controller';

export function createInterventionWindowElectronModule(
  controller: InterventionWindowController,
): IElectronModule {
  return {
    name: 'routine-intervention-window',
    async register() {
      ipcMain.removeHandler(RoutineWindowChannels.INTERVENTION_WINDOW_GET);
      ipcMain.removeHandler(RoutineWindowChannels.INTERVENTION_WINDOW_COMMAND);
      ipcMain.handle(RoutineWindowChannels.INTERVENTION_WINDOW_GET, async () =>
        ok(controller.getProjection()),
      );
      ipcMain.handle(
        RoutineWindowChannels.INTERVENTION_WINDOW_COMMAND,
        async (_event, command: unknown) => {
          const parsed = InterventionWindowCommandSchema.safeParse(command);
          if (!parsed.success) {
            return error(
              'ROUTINE_INTERVENTION_WINDOW_INVALID_COMMAND',
              'Invalid InterventionWindow command',
            );
          }
          try {
            return ok(controller.execute(parsed.data));
          } catch {
            return error(
              'ROUTINE_INTERVENTION_WINDOW_COMMAND_FAILED',
              'InterventionWindow command failed',
            );
          }
        },
      );
    },
    async destroy() {
      ipcMain.removeHandler(RoutineWindowChannels.INTERVENTION_WINDOW_GET);
      ipcMain.removeHandler(RoutineWindowChannels.INTERVENTION_WINDOW_COMMAND);
      controller.destroy();
    },
  };
}
