import { inject, onBeforeUnmount, watch, type Ref } from 'vue';
import { unwrapOrThrowError } from '@memoflow/contracts/result';
import { createResultIpcClient } from '@memoflow/ipc-client';
import {
  DeviceKeymapSchema,
  DeviceKeymapSnapshotSchema,
  type DeviceKeymap,
} from '@memoflow/contracts/shared';
import { DesktopFeatureChannels } from '@memoflow/contracts/electron';
import type { DesktopAccessSnapshot } from '@memoflow/contracts/electron';
import { DESKTOP_BRIDGE_KEY } from '../../di/keys';
import { keyboard } from './runtime';
import { validateKeymap } from './keymap';
import { createDeviceKeymapController } from './device-keymap-controller';

const controller = createDeviceKeymapController(keyboard.applyKeymap, (error) => {
  keyboard.storageError.value = error;
});
export async function saveDeviceKeymap(input: unknown): Promise<void> {
  const { keymap, conflicts } = validateKeymap(input, keyboard.engine.host);
  if (conflicts.length) throw new Error('快捷键冲突，请先替换或解除原绑定');
  await controller.save(keymap);
}
export function useDeviceKeymap(
  identity: () => string | null,
  access: Ref<DesktopAccessSnapshot | null>,
): void {
  const bridge = inject(DESKTOP_BRIDGE_KEY, null);
  const client = bridge ? createResultIpcClient({ bridge }) : null;
  watch(
    () => (keyboard.engine.host.desktop ? (access.value?.profile?.profileId ?? null) : identity()),
    (scope) => {
      if (!scope) {
        void controller.load(null);
        return;
      }
      if (keyboard.engine.host.desktop) {
        if (!client) {
          void controller.load(null);
          keyboard.storageError.value = '桌面快捷键存储不可用';
          return;
        }
        const decode = (input: unknown) => {
          const snapshot = DeviceKeymapSnapshotSchema.parse(input);
          if (snapshot.profileId !== scope) throw new Error('Profile 已切换');
          return snapshot.keymap;
        };
        void controller.load({
          async read() {
            const result = await client.invoke(DesktopFeatureChannels.KEYMAP_GET);
            return decode(unwrapOrThrowError(result));
          },
          async write(keymap: DeviceKeymap) {
            const result = await client.invoke(DesktopFeatureChannels.KEYMAP_SET, {
              profileId: scope,
              keymap,
            });
            return decode(unwrapOrThrowError(result));
          },
        });
      } else {
        const key = `memoflow:keyboard:v1:${encodeURIComponent(scope)}`;
        void controller.load({
          async read() {
            const value = localStorage.getItem(key);
            return value
              ? DeviceKeymapSchema.parse(JSON.parse(value))
              : { version: 1, overrides: {} };
          },
          async write(value) {
            localStorage.setItem(key, JSON.stringify(value));
            return value;
          },
        });
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    void controller.load(null);
  });
}
