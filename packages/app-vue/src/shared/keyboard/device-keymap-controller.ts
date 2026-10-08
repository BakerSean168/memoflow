import { presentErrorMessage } from '@memoflow/http-client';
import type { DeviceKeymap } from '@memoflow/contracts/shared';
export interface KeymapStorage {
  read(): Promise<unknown>;
  write(keymap: DeviceKeymap): Promise<unknown>;
}

/** Commits effective bindings only after durable success in the same identity scope. */
export function createDeviceKeymapController(
  apply: (input: unknown) => void,
  report: (message: string | null) => void,
) {
  let generation = 0;
  let storage: KeymapStorage | null = null;
  let busy = false;
  let loading = false;
  return {
    async load(next: KeymapStorage | null) {
      const epoch = ++generation;
      storage = next;
      busy = false;
      apply({ version: 1, overrides: {} });
      report(null);
      loading = Boolean(next);
      if (!next) return;
      try {
        const input = await next.read();
        if (epoch === generation) apply(input);
      } catch (error) {
        if (epoch === generation) report(presentErrorMessage(error, '无法读取此设备的快捷键配置'));
      } finally {
        if (epoch === generation) loading = false;
      }
    },
    async save(keymap: DeviceKeymap) {
      if (!storage) throw new Error('需要当前用户 / Profile 才能保存快捷键');
      if (loading) throw new Error('正在加载快捷键，请稍后重试');
      if (busy) throw new Error('正在保存，请稍后重试');
      const epoch = generation;
      const target = storage;
      busy = true;
      try {
        const persisted = await target.write(keymap);
        if (epoch !== generation) throw new Error('用户 / Profile 已切换，请重试');
        apply(persisted);
        report(null);
      } finally {
        if (epoch === generation) busy = false;
      }
    },
  };
}
