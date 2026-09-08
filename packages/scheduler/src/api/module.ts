import type { ServerModuleHandle, ServerTransportModuleContext } from '@memoflow/contracts/shared';
import type { SchedulerModuleInstance } from '../server/infrastructure';
import { registerSchedulerRoutes } from './routes';

export type SchedulerApiModuleContext = ServerTransportModuleContext;
export interface SchedulerApiModuleDef extends ServerModuleHandle<SchedulerApiModuleContext> {}
export interface SchedulerApiModuleOptions { readonly instance: SchedulerModuleInstance; }

type State = 'created' | 'registered' | 'disposed' | 'failed';

export function createSchedulerApiModule(options: SchedulerApiModuleOptions): SchedulerApiModuleDef {
  if (!options?.instance) throw new Error('[FAIL-CLOSED] createSchedulerApiModule requires options.instance');
  let state: State = 'created';
  return {
    name: 'Scheduler',
    async register(context) {
      if (state !== 'created') throw new Error(`SchedulerApiModule.register() called while in '${state}' state; a handle may only register once from 'created'`);
      try {
        const routes = registerSchedulerRoutes(options.instance.api, context.middleware, context.openApiRegistry);
        await options.instance.start();
        const stackLen = context.router.stack.length;
        try {
          context.router.use('/schedules', routes);
        } catch (error) {
          context.router.stack.length = stackLen;
          throw error;
        }
        state = 'registered';
      } catch (error) {
        state = 'failed';
        try { await options.instance.dispose(); } catch {}
        throw error;
      }
    },
    destroy() {
      if (state === 'disposed' || state === 'failed') return;
      state = 'disposed';
      void options.instance.dispose();
    },
  };
}
