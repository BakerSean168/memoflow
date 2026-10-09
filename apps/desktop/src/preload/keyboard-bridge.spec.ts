import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { KeyboardChannels } from '@memoflow/contracts/electron';
import { unwrapOrThrowError } from '@memoflow/contracts/result';
import { createResultIpcClient, type ElectronBridge } from '@memoflow/ipc-client';
import { registerKeyboardHandlers } from '../main/ipc/keyboard-handlers';

// Only Electron's process transport is replaced; preload policy, Result client,
// Main handlers, validation and filesystem persistence all use production code.
const transport = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  expose: vi.fn(),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: transport.expose },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) =>
      transport.handlers.set(channel, handler),
  },
  ipcRenderer: {
    invoke: async (channel: string, ...args: unknown[]) => {
      const handler = transport.handlers.get(channel);
      if (!handler) throw new Error(`Missing handler: ${channel}`);
      return handler({}, ...args);
    },
  },
}));
import './preload';

const directories: string[] = [];
afterEach(() => {
  transport.handlers.clear();
  directories
    .splice(0)
    .forEach((directory) => fs.rmSync(directory, { recursive: true, force: true }));
});

it('reads, changes and disables shortcuts through preload, then reloads the durable keymap', async () => {
  const uiDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-keyboard-bridge-'));
  directories.push(uiDir);
  const resolveProfile = () => ({ profileId: 'guest-test', uiDir });
  registerKeyboardHandlers(resolveProfile);
  const bridge: ElectronBridge = transport.expose.mock.calls[0][1];
  const client = createResultIpcClient({ bridge, enableLogging: false });
  const defaults = { profileId: 'guest-test', keymap: { version: 1, overrides: {} } };
  expect(unwrapOrThrowError(await client.invoke(KeyboardChannels.KEYMAP_GET))).toEqual(defaults);

  const custom = {
    profileId: 'guest-test',
    keymap: {
      version: 1,
      disabled: ['module.task.activate'],
      overrides: { 'module.goal.activate': ['Alt+G'], 'app.help': [] },
    },
  };
  expect(unwrapOrThrowError(await client.invoke(KeyboardChannels.KEYMAP_SET, custom))).toEqual(
    custom,
  );
  transport.handlers.clear();
  registerKeyboardHandlers(resolveProfile);
  expect(unwrapOrThrowError(await client.invoke(KeyboardChannels.KEYMAP_GET))).toEqual(custom);
  await expect(bridge.invoke('desktop:keyboard:arbitrary')).rejects.toThrow('not allowed');
  expect(unwrapOrThrowError(await client.invoke(KeyboardChannels.KEYMAP_SET, defaults))).toEqual(
    defaults,
  );
});
