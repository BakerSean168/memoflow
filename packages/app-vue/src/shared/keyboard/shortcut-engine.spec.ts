import { describe, expect, it, vi } from 'vitest';
import { createShortcutEngine } from './shortcut-engine';

describe('shortcut dispatch', () => {
  it('executes once and protects typing, composition, AltGraph and held keys', () => {
    const execute = vi.fn();
    const engine = createShortcutEngine({ platform: 'linux', desktop: false });
    engine.register('module.goal.preview', execute);
    const press = (init: KeyboardEventInit = {}, editable = false) => {
      const event = new KeyboardEvent('keydown', { key: '1', cancelable: true, ...init });
      engine.handle(event, { scope: 'workspace', editable });
      return event;
    };
    expect(press().defaultPrevented).toBe(true);
    press({}, true);
    press({ isComposing: true });
    press({ repeat: true });
    press({ ctrlKey: true, altKey: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('blocks workspace commands behind a modal and permits explicit app chords in editors', () => {
    const execute = vi.fn();
    const engine = createShortcutEngine({ platform: 'mac', desktop: false });
    engine.register('app.palette', execute);
    engine.handle(new KeyboardEvent('keydown', { key: 'k', metaKey: true }), {
      scope: 'modal',
      editable: false,
    });
    expect(execute).not.toHaveBeenCalled();
    engine.handle(new KeyboardEvent('keydown', { key: 'k', metaKey: true }), {
      scope: 'workspace',
      editable: true,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

it('temporarily disables a command without losing its customized binding', () => {
  const engine = createShortcutEngine({ platform: 'linux', desktop: false });
  const overrides = { 'module.goal.activate': ['Alt+G'] };
  engine.setKeymap({ version: 1, overrides, disabled: ['module.goal.activate'] });
  expect(engine.bindings('module.goal.activate')).toEqual([]);
  engine.setKeymap({ version: 1, overrides });
  expect(engine.bindings('module.goal.activate')).toEqual(['Alt+G']);
});

it('allows the desktop new-conversation chord while preserving plain N input', () => {
  const engine = createShortcutEngine({ platform: 'linux', desktop: true });
  const execute = vi.fn();
  engine.register('conversation.new', execute);
  engine.handle(new KeyboardEvent('keydown', { key: 'n' }), { scope: 'workspace', editable: true });
  expect(execute).not.toHaveBeenCalled();
  engine.handle(new KeyboardEvent('keydown', { key: 'O', ctrlKey: true, shiftKey: true }), {
    scope: 'workspace',
    editable: true,
  });
  expect(execute).toHaveBeenCalledTimes(1);
});
