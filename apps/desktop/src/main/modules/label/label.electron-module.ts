import { ipcMain } from 'electron';
import {
  LabelChannels,
  type IElectronModule,
  type IElectronModuleContext,
} from '@memoflow/contracts/electron';
import { withAuthenticatedIdentity } from '@memoflow/host-runtime/electron-ipc';
import { CreateLabelReqSchema, ListLabelsReqSchema } from '@memoflow/contracts/label';
import { fail, ok } from '@memoflow/contracts/result';
import type { LabelService } from '@memoflow/label';
import { toLabelClientDTO } from '@memoflow/label/client';

export interface LabelElectronModuleOptions {
  readonly service: Pick<LabelService, 'list' | 'create'>;
}

export function createLabelElectronModule(options: LabelElectronModuleOptions): IElectronModule {
  let registered = false;
  return {
    name: 'Label',
    register(context: IElectronModuleContext) {
      if (registered) throw new Error('LabelElectronModule may only register once');
      registered = true;

      ipcMain.handle(LabelChannels.LIST, (_event, request: unknown = {}) =>
        withAuthenticatedIdentity(context, async (identityId) => {
          const parsed = ListLabelsReqSchema.safeParse(request);
          if (!parsed.success) {
            return fail({ code: 'VALIDATION_ERROR', message: 'Invalid label query' });
          }
          const labels = await options.service.list({ identityId, ...parsed.data });
          return ok(labels.map(toLabelClientDTO));
        }),
      );

      ipcMain.handle(LabelChannels.CREATE, (_event, request: unknown) =>
        withAuthenticatedIdentity(context, async (identityId) => {
          const parsed = CreateLabelReqSchema.safeParse(request);
          if (!parsed.success) {
            return fail({ code: 'VALIDATION_ERROR', message: 'Invalid label request' });
          }
          const label = await options.service.create({ identityId, ...parsed.data });
          return ok(toLabelClientDTO(label));
        }),
      );
    },
    destroy() {
      ipcMain.removeHandler(LabelChannels.LIST);
      ipcMain.removeHandler(LabelChannels.CREATE);
    },
  };
}
