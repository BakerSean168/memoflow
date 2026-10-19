import os from 'node:os';
import { tsImport } from 'tsx/esm/api';

const { resolveDesktopStorageRoots } = await tsImport('../src/main/paths/desktop-storage-roots.ts', import.meta.url);

/** Same pure provider as Electron; reset scripts never guess or scan user folders. */
export function resolveStorageRoots() {
  if (!['win32', 'linux', 'darwin'].includes(process.platform)) throw new Error('Unsupported platform');
  const channels = process.env.MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT === undefined
    ? ['production', 'development', 'test'] : ['test'];
  return channels.map((channel) => resolveDesktopStorageRoots({
    platform: process.platform, channel, home: os.homedir(), env: process.env,
  }));
}
