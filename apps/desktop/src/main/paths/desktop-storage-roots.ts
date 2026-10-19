import path from 'node:path';

export type DesktopRuntimeChannel = 'production' | 'development' | 'test';
export interface DesktopStorageRoots {
  readonly platform: 'win32' | 'linux' | 'darwin';
  readonly channel: DesktopRuntimeChannel;
  readonly configRoot: string;
  readonly dataRoot: string;
  readonly stateRoot: string;
  readonly cacheRoot: string;
  readonly logsDir: string;
  readonly electronUserData: string;
  readonly electronSessionData: string;
}
export interface StoragePlatform {
  platform: 'win32' | 'linux' | 'darwin';
  channel: DesktopRuntimeChannel;
  home: string;
  env: Readonly<Record<string, string | undefined>>;
  /** Independently resolved Known Folders; never infer Local from Roaming. */
  knownFolder?: (folder: 'roamingAppData' | 'localAppData') => string | undefined;
}

/**
 * CACHE may live inside a durable root, but must never contain a durable root:
 * removing CACHE must not remove any non-cache owner (including Chromium sessions).
 */
export function assertDesktopCacheIsDisposable(roots: DesktopStorageRoots): void {
  const p = roots.platform === 'win32' ? path.win32 : path.posix;
  for (const root of [
    roots.configRoot,
    roots.dataRoot,
    roots.stateRoot,
    roots.logsDir,
    roots.electronUserData,
    roots.electronSessionData,
  ]) {
    const relative = p.relative(roots.cacheRoot, root);
    if (
      relative === '' ||
      (relative !== '..' && !relative.startsWith(`..${p.sep}`) && !p.isAbsolute(relative))
    ) {
      throw new Error(
        `Unsafe desktop cache root "${roots.cacheRoot}" contains persistent root "${root}"`,
      );
    }
  }
}

/** Pure: resolving a path never creates it. Invalid explicit test roots fail closed. */
export function resolveDesktopStorageRoots(input: StoragePlatform): DesktopStorageRoots {
  const { platform, channel, home, env } = input;
  const p = platform === 'win32' ? path.win32 : path.posix;
  const name =
    channel === 'production'
      ? 'MemoFlow'
      : `MemoFlow-${channel === 'development' ? 'Dev' : 'Test'}`;
  let configRoot: string;
  let dataRoot: string;
  let stateRoot: string;
  let cacheRoot: string;
  const testRoot = env.MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT;
  if (testRoot !== undefined) {
    if (!p.isAbsolute(testRoot)) throw new Error('Desktop storage test root must be absolute');
    const normalizedTestRoot = p.resolve(testRoot);
    if (normalizedTestRoot === p.parse(normalizedTestRoot).root)
      throw new Error('Desktop storage test root must not be a filesystem root');
    configRoot = p.join(testRoot, 'config');
    dataRoot = p.join(testRoot, 'data');
    stateRoot = p.join(testRoot, 'state');
    cacheRoot = p.join(testRoot, 'cache');
  } else if (platform === 'win32') {
    const folder = (key: 'roamingAppData' | 'localAppData', variable: string) => {
      const value = input.knownFolder?.(key) ?? env[variable];
      if (!value || !p.isAbsolute(value))
        throw new Error(`Missing absolute Windows Known Folder: ${variable}`);
      return value;
    };
    configRoot = p.join(folder('roamingAppData', 'APPDATA'), name);
    const local = p.join(folder('localAppData', 'LOCALAPPDATA'), name);
    dataRoot = p.join(local, 'data');
    stateRoot = p.join(local, 'state');
    cacheRoot = p.join(local, 'cache');
  } else if (platform === 'linux') {
    const xdg = (key: string, fallback: string) => {
      const value = env[key];
      return p.join(
        value && p.isAbsolute(value) ? value : p.join(home, fallback),
        name.toLowerCase(),
      );
    };
    configRoot = xdg('XDG_CONFIG_HOME', '.config');
    dataRoot = xdg('XDG_DATA_HOME', '.local/share');
    stateRoot = xdg('XDG_STATE_HOME', '.local/state');
    cacheRoot = xdg('XDG_CACHE_HOME', '.cache');
  } else {
    const support = p.join(home, 'Library', 'Application Support', name);
    configRoot = p.join(support, 'config');
    dataRoot = p.join(support, 'data');
    stateRoot = p.join(support, 'state');
    cacheRoot = p.join(home, 'Library', 'Caches', name);
  }
  const roots: DesktopStorageRoots = {
    platform,
    channel,
    configRoot,
    dataRoot,
    stateRoot,
    cacheRoot,
    logsDir:
      platform === 'darwin' && testRoot === undefined
        ? p.join(home, 'Library', 'Logs', name)
        : p.join(stateRoot, 'logs'),
    electronUserData: p.join(configRoot, 'electron'),
    electronSessionData: p.join(dataRoot, 'chromium-session'),
  };
  assertDesktopCacheIsDisposable(roots);
  return Object.freeze(roots);
}
