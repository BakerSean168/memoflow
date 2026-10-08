import { describe, expect, it } from 'vitest';
import { eventChord, normalizeChord, validateKeymap } from './keymap';
import { commandDefinitions } from './commands';

describe.each(['mac', 'windows', 'linux'] as const)('%s host keymaps', (platform) => {
  it.each([true, false])('has conflict-free defaults (desktop %s)', (desktop) => {
    expect(validateKeymap({ version: 1, overrides: {} }, { platform, desktop }).conflicts).toEqual(
      [],
    );
    const commands = commandDefinitions({ platform, desktop });
    expect(commands.find((c) => c.id === 'conversation.new')?.keys.includes('Mod+Shift+O')).toBe(
      desktop,
    );
  });
  it('rejects reserved browser shortcuts and malformed imported commands', () => {
    const host = { platform, desktop: false };
    expect(() =>
      validateKeymap({ version: 1, overrides: { 'module.goal.activate': ['Mod+1'] } }, host),
    ).toThrow('浏览器');
    expect(() =>
      validateKeymap({ version: 1, overrides: { 'unknown.command': ['A'] } }, host),
    ).toThrow();
    expect(() =>
      validateKeymap({ version: 1, overrides: { 'module.goal.activate': ['Alt+Ctrl+A'] } }, host),
    ).toThrow('AltGraph');
  });
});
it('releases overridden keys and reports overlapping scopes without rejecting preview/list reuse', () => {
  const host = { platform: 'linux' as const, desktop: false };
  expect(
    validateKeymap({ version: 1, overrides: { 'module.goal.activate': ['Alt+G'] } }, host)
      .conflicts,
  ).toEqual([]);
  expect(
    validateKeymap({ version: 1, overrides: { 'module.goal.activate': ['Alt+2'] } }, host)
      .conflicts,
  ).toEqual([{ chord: 'Alt+2', commands: ['module.goal.activate', 'module.task.activate'] }]);
  expect(
    validateKeymap({ version: 1, overrides: { 'app.help': ['J'] } }, host).conflicts.length,
  ).toBe(2);
});
it('normalizes aliases and handles Option symbols, shifted question marks and keyboard layouts', () => {
  const host = { platform: 'mac' as const, desktop: true };
  expect(normalizeChord('cmd+k', host)).toBe('Meta+K');
  expect(
    eventChord(new KeyboardEvent('keydown', { key: '¡', code: 'Digit1', altKey: true }), host),
  ).toBe('Alt+1');
  expect(eventChord(new KeyboardEvent('keydown', { key: '?', shiftKey: true }), host)).toBe('?');
  expect(eventChord(new KeyboardEvent('keydown', { key: 'z', code: 'KeyY' }), host)).toBe('Z');
});

it('rejects the desktop show/hide global accelerator owned by Electron', () => {
  for (const platform of ['mac', 'windows', 'linux'] as const) {
    expect(() =>
      validateKeymap(
        { version: 1, overrides: { 'module.goal.activate': ['Mod+Shift+D'] } },
        { platform, desktop: true },
      ),
    ).toThrow('显示 / 隐藏应用');
  }
});
