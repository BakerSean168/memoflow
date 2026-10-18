import { app } from 'electron';
import path from 'node:path';

const DESKTOP_LOCAL_ROOT = 'MemoFlow';
const DESKTOP_USER_FILES_ROOT = 'MemoFlow Files';

export const DESKTOP_USER_DATA_DIRS = Object.freeze({
  production: DESKTOP_LOCAL_ROOT,
  development: `${DESKTOP_LOCAL_ROOT}-Dev`,
  test: `${DESKTOP_LOCAL_ROOT}-Test`,
});

export const DESKTOP_USER_FILES_DIRS = Object.freeze({
  production: DESKTOP_USER_FILES_ROOT,
  development: `${DESKTOP_USER_FILES_ROOT} Dev`,
  test: `${DESKTOP_USER_FILES_ROOT} Test`,
});

export type DesktopRuntimeChannel = keyof typeof DESKTOP_USER_DATA_DIRS;

function getExplicitDesktopUserDataPath(): string | null {
  const explicitPath = process.env.MEMOFLOW_DESKTOP_USER_DATA_PATH?.trim();
  return explicitPath && explicitPath.length > 0 ? explicitPath : null;
}

function getDesktopRuntimeChannel(): DesktopRuntimeChannel {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return 'test';
  }

  return app.isPackaged ? 'production' : 'development';
}

export function getDesktopUserDataDirName(
  channel: DesktopRuntimeChannel = getDesktopRuntimeChannel(),
): string {
  return DESKTOP_USER_DATA_DIRS[channel];
}

export function getDesktopUserFilesDirName(
  channel: DesktopRuntimeChannel = getDesktopRuntimeChannel(),
): string {
  return DESKTOP_USER_FILES_DIRS[channel];
}

/**
 * Get the LocalAppData directory path.
 *
 * Electron doesn't expose `localAppData` via `app.getPath()`.
 * On Windows: derives Local from Roaming (sibling directories).
 * On macOS/Linux: falls back to `app.getPath('userData')`.
 */
function getLocalAppDataPath(): string {
  if (process.platform === 'win32') {
    const appData = app.getPath('appData'); // C:\Users\<user>\AppData\Roaming
    return path.join(path.dirname(appData), 'Local');
  }
  // macOS / Linux: userData is already local
  return app.getPath('userData');
}

export function resolveDesktopUserDataPath(
  channel: DesktopRuntimeChannel = getDesktopRuntimeChannel(),
): string {
  const explicitPath = getExplicitDesktopUserDataPath();
  if (explicitPath) {
    return explicitPath;
  }

  return path.join(getLocalAppDataPath(), getDesktopUserDataDirName(channel));
}

export function resolveDesktopUserFilesPath(
  channel: DesktopRuntimeChannel = getDesktopRuntimeChannel(),
): string {
  const explicitPath = process.env.MEMOFLOW_DESKTOP_USER_FILES_PATH?.trim();
  if (explicitPath) {
    return explicitPath;
  }

  const documentsPath = app.getPath('documents');
  // On headless Linux/WSL, Electron can resolve Documents to the home directory.
  // Keep exported files out of ~ and co-locate them with the channel-specific app data.
  if (path.resolve(documentsPath) === path.resolve(app.getPath('home'))) {
    return path.join(app.getPath('userData'), 'files');
  }

  return path.join(documentsPath, getDesktopUserFilesDirName(channel));
}

export function configureDesktopUserDataPath(): string {
  const userDataPath = resolveDesktopUserDataPath();

  app.setName(DESKTOP_LOCAL_ROOT);
  app.setPath('userData', userDataPath);

  return userDataPath;
}
