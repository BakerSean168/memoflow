import { ipcMain } from 'electron';
import { TaskWorkspaceChannels, withAuthenticatedIdentity, type IElectronModule, type IElectronModuleContext } from '@memoflow/contracts/electron';
import { GetTaskWorkspaceInvocationSchema } from '@memoflow/contracts/task';
import { fail } from '@memoflow/contracts/result';
import type { TaskWorkspaceApplicationPort } from '@memoflow/task';

export function createTaskWorkspaceElectronModule(options: { readonly port: TaskWorkspaceApplicationPort }): IElectronModule {
  return {
    name: 'TaskWorkspace',
    register(context: IElectronModuleContext) {
      ipcMain.handle(TaskWorkspaceChannels.GET, (_event, input: unknown) => withAuthenticatedIdentity(context, async (identityId) => {
        const parsed = GetTaskWorkspaceInvocationSchema.safeParse(input);
        if (!parsed.success) return fail({ code: 'VALIDATION_ERROR', message: 'Invalid Task Workspace query' });
        const { planId, ...request } = parsed.data;
        return options.port.getWorkspace(identityId, planId, request);
      }));
    },
    destroy() { ipcMain.removeHandler(TaskWorkspaceChannels.GET); },
  };
}
