import { ipcMain } from 'electron';
import { DesktopFeatureChannels } from '@memoflow/contracts/electron';
import { fail, ok } from '@memoflow/contracts/result';
import { DeviceKeymapStore, type KeymapProfile } from '../services/device-keymap.store';

export function registerKeyboardHandlers(resolveProfile: () => KeymapProfile | null): void {
  const store = new DeviceKeymapStore(resolveProfile);
  ipcMain.handle(DesktopFeatureChannels.KEYMAP_GET, () => {
    try {
      return ok(store.get());
    } catch (error) {
      return fail({
        code: 'KEYMAP_READ_FAILED',
        message: error instanceof Error ? error.message : 'Unable to read keymap',
      });
    }
  });
  ipcMain.handle(DesktopFeatureChannels.KEYMAP_SET, (_event, input: unknown) => {
    try {
      return ok(store.set(input));
    } catch (error) {
      return fail({
        code: 'KEYMAP_WRITE_FAILED',
        message: error instanceof Error ? error.message : 'Unable to save keymap',
      });
    }
  });
}
