/** Temporal Engine read-only diagnostics Electron transport. */
import { ipcMain } from 'electron';
import { ScheduleChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import { createLogger } from '@memoflow/utils/logger';
import type { SchedulerModuleInstance } from '../server/infrastructure';
import { SchedulerController } from '../server/transport';
import { withAuthenticatedValue } from './authenticated-ipc';

const logger = createLogger('SchedulerElectron');
const schedulerChannels = [
  ScheduleChannels.TASK_LIST,
  ScheduleChannels.TASK_GET_BY_ID,
  ScheduleChannels.TASK_GET_DUE,
  ScheduleChannels.TASK_GET_BY_SOURCE,
] as const;
type State = 'created' | 'registered' | 'disposed' | 'failed';

export interface SchedulerElectronModuleDef {
  readonly name: string;
  register(context: IElectronModuleContext): void;
  destroy?(): Promise<void> | void;
  readonly runtime: { start(): Promise<void>; stop(): Promise<void> };
}
export interface SchedulerElectronModuleOptions { readonly instance: SchedulerModuleInstance; }

export function createSchedulerElectronModule(
  options: SchedulerElectronModuleOptions,
): SchedulerElectronModuleDef {
  if (!options?.instance) throw new Error('[FAIL-CLOSED] createSchedulerElectronModule requires options.instance');
  let state: State = 'created';
  let runtimeStarted = false;
  const runtime = {
    async start() {
      if (runtimeStarted) return;
      await options.instance.start();
      runtimeStarted = true;
      logger.info('Scheduler runtime started');
    },
    async stop() {
      if (!runtimeStarted) return;
      await options.instance.dispose();
      runtimeStarted = false;
      logger.info('Scheduler runtime stopped');
    },
  };

  return {
    name: 'Scheduler',
    runtime,
    register(ctx) {
      if (state !== 'created') {
        throw new Error(`SchedulerElectronModule.register() called while in '${state}' state; a handle may only register once from 'created'`);
      }
      const installed: string[] = [];
      try {
        const controller = new SchedulerController(options.instance.api);
        ipcMain.handle(ScheduleChannels.TASK_LIST, async () =>
          withAuthenticatedValue(ctx, (requestContext) => controller.listTasks({}, requestContext)));
        installed.push(ScheduleChannels.TASK_LIST);
        ipcMain.handle(ScheduleChannels.TASK_GET_BY_ID, async (_event, taskId) =>
          withAuthenticatedValue(ctx, (requestContext) => controller.getTask(taskId, requestContext)));
        installed.push(ScheduleChannels.TASK_GET_BY_ID);
        ipcMain.handle(ScheduleChannels.TASK_GET_DUE, async () =>
          withAuthenticatedValue(ctx, (requestContext) => controller.getDueTasks(requestContext)));
        installed.push(ScheduleChannels.TASK_GET_DUE);
        ipcMain.handle(ScheduleChannels.TASK_GET_BY_SOURCE, async (_event, sourceModule, sourceEntityId) =>
          withAuthenticatedValue(ctx, (requestContext) =>
            controller.listTasks({ sourceModule, sourceEntityId }, requestContext)));
        installed.push(ScheduleChannels.TASK_GET_BY_SOURCE);
        state = 'registered';
      } catch (error) {
        state = 'failed';
        for (const channel of installed.reverse()) ipcMain.removeHandler(channel);
        void options.instance.dispose().catch((disposeError) => logger.error('Scheduler dispose failed after IPC registration failure', disposeError));
        throw error;
      }
    },
    async destroy() {
      if (state === 'disposed' || state === 'failed') return;
      for (const channel of schedulerChannels) ipcMain.removeHandler(channel);
      state = 'disposed';
      await runtime.stop();
    },
  };
}
