import { describe, expect, it, vi } from 'vitest';
import { createShortcutEngine } from './shortcut-engine';
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

it('switches Profile A → B → A in one session without retaining old bindings or accepting stale saves', async () => {
  const engine = createShortcutEngine({ platform: 'linux', desktop: true });
  const activate = vi.fn();
  engine.register('module.goal.activate', activate);
  const report = vi.fn();
  const controller = createDeviceKeymapController(engine.setKeymap, report);
  let acknowledge!: (value: unknown) => void;
  const profileA = {
    read: async () => custom,
    write: () =>
      new Promise((done) => {
        acknowledge = done;
      }),
  };
  const press = (key: string) => {
    const event = new KeyboardEvent('keydown', { key, altKey: true, cancelable: true });
    // happy-dom conflates Alt with AltGraph. Model an ordinary physical Alt
    // here; the engine's independent AltGraph fail-closed tests remain intact.
    const modifierState = event.getModifierState.bind(event);
    vi.spyOn(event, 'getModifierState').mockImplementation((modifier) =>
      modifier === 'AltGraph' ? false : modifierState(modifier),
    );
    return engine.handle(event, { scope: 'workspace', editable: false });
  };
  await controller.load(profileA);
  expect(report).toHaveBeenLastCalledWith(null);
  expect(engine.bindings('module.goal.activate')).toEqual(['Alt+G']);
  expect(press('g')).toBe(true);
  expect(press('1')).toBe(false);
  const saving = controller.save(custom);
  await controller.load({ read: async () => defaults, write: async (value) => value });
  expect(press('g')).toBe(false);
  expect(press('1')).toBe(true);
  acknowledge(custom);
  await expect(saving).rejects.toThrow('Profile');
  expect(press('g')).toBe(false);
  await controller.load(profileA);
  expect(press('1')).toBe(false);
  expect(press('g')).toBe(true);
  expect(activate).toHaveBeenCalledTimes(3);
  await controller.load(null);
  expect(press('g')).toBe(false);
});
