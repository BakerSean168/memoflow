import {
  DesktopStartupChannels,
  DesktopStartupSnapshotSchema,
  DesktopStartupUpdateSchema,
} from '@memoflow/desktop-contracts';
import type { DesktopStartupService } from '@memoflow/app-vue/di';
import type { ElectronBridge, IResultIpcClient } from '@memoflow/ipc-client';
import { fail, ok } from '@memoflow/transport-contracts/result';

export function createDesktopStartupService(
  ipc: IResultIpcClient,
  bridge: ElectronBridge,
): DesktopStartupService {
  return {
    async get() {
      const result = await ipc.invoke<unknown>(DesktopStartupChannels.GET);
      if (!result.ok) return result;
      const parsed = DesktopStartupSnapshotSchema.safeParse(result.data);
      return parsed.success
        ? ok(parsed.data)
        : fail({
            code: 'INTERNAL_ERROR',
            message: 'Invalid startup settings response',
          });
    },
    async update(patch) {
      const result = await ipc.invoke<unknown>(DesktopStartupChannels.UPDATE, patch);
      if (!result.ok) return result;
      const parsed = DesktopStartupUpdateSchema.safeParse(result.data);
      return parsed.success
        ? ok(parsed.data)
        : fail({
            code: 'INTERNAL_ERROR',
            message: 'Invalid startup settings response',
          });
    },
    subscribe(listener) {
      let active = true;
      const handler = (...args: unknown[]) => {
        const parsed = DesktopStartupSnapshotSchema.safeParse(args[0]);
        if (active && parsed.success) listener(parsed.data);
      };
      bridge.on(DesktopStartupChannels.CHANGED, handler);
      return () => {
        active = false;
        bridge.off(DesktopStartupChannels.CHANGED, handler);
      };
    },
  };
}
