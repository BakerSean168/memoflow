/** Planner/Calendar Electron transport. Worker diagnostics live in @memoflow/scheduler/electron. */
import { ipcMain } from 'electron';
import { ok } from '@memoflow/contracts/result';
import { ScheduleChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import { createLogger } from '@memoflow/utils/logger';
import type { ScheduleModuleInstance } from '../server/infrastructure';
import { ScheduleEventController } from '../server/transport';
import { withAuthenticatedValue } from './authenticated-ipc';

const logger = createLogger('ScheduleElectron');
const calendarChannels = [
  ScheduleChannels.LIST,
  ScheduleChannels.LIST_BY_DATE_RANGE,
  ScheduleChannels.GET,
  ScheduleChannels.CREATE,
  ScheduleChannels.UPDATE,
  ScheduleChannels.DELETE,
  ScheduleChannels.GET_CONFLICTS,
  ScheduleChannels.DETECT_CONFLICTS,
  ScheduleChannels.CREATE_WITH_CONFLICT_DETECTION,
  ScheduleChannels.RESOLVE_CONFLICT,
] as const;

type State = 'created' | 'registered' | 'disposed' | 'failed';
export interface ScheduleElectronModuleDef {
  readonly name: string;
  register(context: IElectronModuleContext): void;
  destroy?(): Promise<void> | void;
  readonly runtime: { start(): Promise<void>; stop(): Promise<void> };
}
export interface ScheduleElectronModuleOptions { readonly instance: ScheduleModuleInstance; }

export function createScheduleElectronModule(
  options: ScheduleElectronModuleOptions,
): ScheduleElectronModuleDef {
  if (!options?.instance) throw new Error('[FAIL-CLOSED] createScheduleElectronModule requires options.instance');
  let state: State = 'created';
  let runtimeStarted = false;
  const runtime = {
    async start() {
      if (runtimeStarted) return;
      await options.instance.start();
      runtimeStarted = true;
      logger.info('Schedule Calendar runtime started');
    },
    async stop() {
      if (!runtimeStarted) return;
      await options.instance.dispose();
      runtimeStarted = false;
      logger.info('Schedule Calendar runtime stopped');
    },
  };

  return {
    name: 'Schedule',
    runtime,
    register(ctx) {
      if (state !== 'created') {
        throw new Error(`ScheduleElectronModule.register() called while in '${state}' state; a handle may only register once from 'created'`);
      }
      const installed: string[] = [];
      try {
        const controller = new ScheduleEventController(options.instance.eventApi);
        ipcMain.handle(ScheduleChannels.LIST, async () =>
          withAuthenticatedValue(ctx, (requestContext) =>
            controller.getByTimeRange({ startTime: 0, endTime: Number.MAX_SAFE_INTEGER }, requestContext)));
        installed.push(ScheduleChannels.LIST);
        ipcMain.handle(ScheduleChannels.LIST_BY_DATE_RANGE, async (_event, params) =>
          withAuthenticatedValue(ctx, (requestContext) => controller.getByTimeRange(params ?? {}, requestContext)));
        installed.push(ScheduleChannels.LIST_BY_DATE_RANGE);
        ipcMain.handle(ScheduleChannels.GET, async (_event, id) =>
          withAuthenticatedValue(ctx, (requestContext) => controller.get(id, requestContext)));
        installed.push(ScheduleChannels.GET);
        ipcMain.handle(ScheduleChannels.CREATE, async (_event, dto) =>
          withAuthenticatedValue(ctx, (requestContext) => controller.create(dto, requestContext)));
        installed.push(ScheduleChannels.CREATE);
        ipcMain.handle(ScheduleChannels.UPDATE, async (_event, id, dto) =>
          withAuthenticatedValue(ctx, (requestContext) => controller.update(id, dto, requestContext)));
        installed.push(ScheduleChannels.UPDATE);
        ipcMain.handle(ScheduleChannels.DELETE, async (_event, id, input) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            const payload = typeof input === 'number' ? { expectedVersion: input } : input;
            const result = await controller.delete(id, payload, requestContext);
            return result.ok ? ok(null) : result;
          }));
        installed.push(ScheduleChannels.DELETE);
        ipcMain.handle(ScheduleChannels.GET_CONFLICTS, async (_event, id) =>
          withAuthenticatedValue(ctx, (requestContext) => controller.getConflicts(id, requestContext)));
        installed.push(ScheduleChannels.GET_CONFLICTS);
        ipcMain.handle(ScheduleChannels.DETECT_CONFLICTS, async (_event, params) =>
          withAuthenticatedValue(ctx, (requestContext) => controller.detectConflicts(params, requestContext)));
        installed.push(ScheduleChannels.DETECT_CONFLICTS);
        ipcMain.handle(ScheduleChannels.CREATE_WITH_CONFLICT_DETECTION, async (_event, request) =>
          withAuthenticatedValue(ctx, (requestContext) => controller.createWithConflictDetection(request, requestContext)));
        installed.push(ScheduleChannels.CREATE_WITH_CONFLICT_DETECTION);
        ipcMain.handle(ScheduleChannels.RESOLVE_CONFLICT, async (_event, scheduleId, request) =>
          withAuthenticatedValue(ctx, (requestContext) => controller.resolveConflict(scheduleId, request, requestContext)));
        installed.push(ScheduleChannels.RESOLVE_CONFLICT);
        state = 'registered';
      } catch (error) {
        state = 'failed';
        for (const channel of installed.reverse()) ipcMain.removeHandler(channel);
        void options.instance.dispose().catch((disposeError) => logger.error('Schedule dispose failed after IPC registration failure', disposeError));
        throw error;
      }
    },
    async destroy() {
      if (state === 'disposed' || state === 'failed') return;
      for (const channel of calendarChannels) ipcMain.removeHandler(channel);
      state = 'disposed';
      await runtime.stop();
    },
  };
}
