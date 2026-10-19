import fs from 'node:fs';
import type { DesktopStorageRoots } from './paths/desktop-storage-roots';

interface StorageApp {
  isReady(): boolean;
  setPath(name: 'userData' | 'sessionData', value: string): void;
  setAppLogsPath(value: string): void;
}

/** Must run before ready or importing any module that constructs a Session. */
export function configureDesktopStorage(app: StorageApp, roots: DesktopStorageRoots): void {
  if (app.isReady()) throw new Error('Storage must be configured before Electron ready');
  for (const dir of [roots.electronUserData, roots.electronSessionData, roots.logsDir]) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  app.setPath('userData', roots.electronUserData);
  app.setPath('sessionData', roots.electronSessionData);
  app.setAppLogsPath(roots.logsDir);
}
