import { ipcMain } from 'electron';
import {
  GoalWorkspaceChannels,
  withAuthenticatedIdentity,
  type IElectronModule,
  type IElectronModuleContext,
} from '@memoflow/contracts/electron';
import {
  GetGoalWorkspaceInvocationSchema,
  GoalWorkspaceKnowledgePageInvocationSchema,
  GoalWorkspaceTaskPageInvocationSchema,
} from '@memoflow/contracts/goal';
import { fail } from '@memoflow/contracts/result';
import type { GoalWorkspaceApplicationPort } from '@memoflow/goal';

export function createGoalWorkspaceElectronModule(options: {
  readonly port: GoalWorkspaceApplicationPort;
}): IElectronModule {
  let registered = false;
  return {
    name: 'GoalWorkspace',
    register(context: IElectronModuleContext) {
      if (registered) throw new Error('GoalWorkspaceElectronModule may only register once');
      registered = true;

      ipcMain.handle(GoalWorkspaceChannels.GET, (_event, input: unknown) =>
        withAuthenticatedIdentity(context, async (identityId) => {
          const parsed = GetGoalWorkspaceInvocationSchema.safeParse(input);
          if (!parsed.success)
            return fail({ code: 'VALIDATION_ERROR', message: 'Invalid Goal Workspace query' });
          const { goalId, ...request } = parsed.data;
          return options.port.getWorkspace(identityId, goalId, request);
        }),
      );
      ipcMain.handle(GoalWorkspaceChannels.TASKS, (_event, input: unknown) =>
        withAuthenticatedIdentity(context, async (identityId) => {
          const parsed = GoalWorkspaceTaskPageInvocationSchema.safeParse(input);
          if (!parsed.success)
            return fail({ code: 'VALIDATION_ERROR', message: 'Invalid Goal Workspace task query' });
          const { goalId, ...request } = parsed.data;
          return options.port.listTasks(identityId, goalId, request);
        }),
      );
      ipcMain.handle(GoalWorkspaceChannels.KNOWLEDGE, (_event, input: unknown) =>
        withAuthenticatedIdentity(context, async (identityId) => {
          const parsed = GoalWorkspaceKnowledgePageInvocationSchema.safeParse(input);
          if (!parsed.success)
            return fail({
              code: 'VALIDATION_ERROR',
              message: 'Invalid Goal Workspace knowledge query',
            });
          const { goalId, ...request } = parsed.data;
          return options.port.listKnowledge(identityId, goalId, request);
        }),
      );
    },
    destroy() {
      ipcMain.removeHandler(GoalWorkspaceChannels.GET);
      ipcMain.removeHandler(GoalWorkspaceChannels.TASKS);
      ipcMain.removeHandler(GoalWorkspaceChannels.KNOWLEDGE);
    },
  };
}
