import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceKeymapStore } from './device-keymap.store';
const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  directories.splice(0).forEach((p) => fs.rmSync(p, { recursive: true, force: true }));
});
describe('profile keymap persistence', () => {
  it('persists only overrides and isolates profiles, stale writes and missing profiles', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-keymap-'));
    directories.push(root);
    let profile: { profileId: string; uiDir: string } | null = {
      profileId: 'a',
      uiDir: path.join(root, 'a'),
    };
    const store = new DeviceKeymapStore(() => profile);
    const keymap = { version: 1, overrides: { 'module.goal.activate': ['Alt+G'] } };
    store.set({ profileId: 'a', keymap });
    expect(new DeviceKeymapStore(() => profile).get().keymap).toEqual(keymap);
    profile = { profileId: 'b', uiDir: path.join(root, 'b') };
    expect(store.get().keymap.overrides).toEqual({});
    expect(() => store.set({ profileId: 'a', keymap })).toThrow('Profile changed');
    expect(() =>
      store.set({ profileId: 'b', keymap: { version: 1, overrides: { unknown: ['K'] } } }),
    ).toThrow();
    profile = null;
    expect(() => store.get()).toThrow('active Profile');
  });
  it('keeps the prior durable configuration when atomic replacement fails', () => {
    const uiDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-keymap-'));
    directories.push(uiDir);
    const store = new DeviceKeymapStore(() => ({ profileId: 'a', uiDir }));
    store.set({ profileId: 'a', keymap: { version: 1, overrides: {} } });
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    expect(() =>
      store.set({ profileId: 'a', keymap: { version: 1, overrides: { 'app.help': ['H'] } } }),
    ).toThrow('disk full');
    expect(store.get().keymap.overrides).toEqual({});
    expect(fs.readdirSync(uiDir)).toEqual(['keyboard-keymap.json']);
  });
});
