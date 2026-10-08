import { describe, expect, it, vi } from 'vitest';
import { createDeviceKeymapController } from './device-keymap-controller';
const defaults = { version: 1 as const, overrides: {} };
const custom = { version: 1 as const, overrides: { 'module.goal.activate': ['Alt+G'] } };
it('does not apply a failed save or a stale read after profile switch', async () => {
  const apply = vi.fn();
  const report = vi.fn();
  const controller = createDeviceKeymapController(apply, report);
  let resolve!: (value: unknown) => void;
  const loading = controller.load({
    read: () =>
      new Promise((done) => {
        resolve = done;
      }),
    write: vi.fn(),
  });
  await controller.load({
    read: async () => defaults,
    write: async () => {
      throw new Error('disk full');
    },
  });
  resolve(custom);
  await loading;
  expect(apply).toHaveBeenLastCalledWith(defaults);
  await expect(controller.save(custom)).rejects.toThrow('disk full');
  expect(apply).toHaveBeenLastCalledWith(defaults);
});

describe('save acknowledgement', () => {
  it('ignores a late acknowledgement after changing identity', async () => {
    const apply = vi.fn();
    const controller = createDeviceKeymapController(apply, vi.fn());
    let acknowledge!: (value: unknown) => void;
    await controller.load({
      read: async () => defaults,
      write: () =>
        new Promise((done) => {
          acknowledge = done;
        }),
    });
    const saving = controller.save(custom);
    await controller.load(null);
    acknowledge(custom);
    await expect(saving).rejects.toThrow('Profile');
    expect(apply).toHaveBeenLastCalledWith(defaults);
  });
});
