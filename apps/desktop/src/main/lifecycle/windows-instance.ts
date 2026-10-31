import type { App } from 'electron';

/** Electron scopes the lock to userData, already isolated by storage channel/root.
 * Development keeps its existing multi-process debugging behavior.
 */
export function claimWindowsInstance(
  host: Pick<App, 'isPackaged' | 'requestSingleInstanceLock' | 'on' | 'exit'>,
  restore: () => void,
  platform = process.platform,
): boolean {
  if (platform !== 'win32' || !host.isPackaged) return true;
  if (!host.requestSingleInstanceLock()) {
    host.exit(0);
    return false;
  }
  host.on('second-instance', restore);
  return true;
}
