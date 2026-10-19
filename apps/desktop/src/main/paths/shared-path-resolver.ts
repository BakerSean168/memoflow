import path from 'node:path';
import type { SharedPathResolver } from './types';
import type { DesktopStorageRoots } from './desktop-storage-roots';

/** Pure derivation; each directory has exactly one lifecycle owner. */
export function createSharedPathResolver(roots: DesktopStorageRoots): SharedPathResolver {
  const p = roots.platform === 'win32' ? path.win32 : path.posix;
  const sharedDir = p.join(roots.dataRoot, 'shared');
  const authDir = p.join(sharedDir, 'auth');
  const configDir = p.join(roots.configRoot, 'shared', 'preferences');
  const uiDir = p.join(roots.stateRoot, 'shared', 'ui');
  const profilesRegistryDir = p.join(sharedDir, 'profiles');
  const cacheDir = roots.cacheRoot;
  return {
    roots,
    sharedDir,
    authDir,
    configDir,
    uiDir,
    profilesRegistryDir,
    deviceIdPath: p.join(authDir, 'device-id'),
    runtimeConfigPath: p.join(configDir, 'desktop-runtime.json'),
    profileAccessWindowStatePath: p.join(uiDir, 'profile-access-window-state.json'),
    registryPath: p.join(profilesRegistryDir, 'registry.json'),
    cacheDir,
    snapshotStagingDir: p.join(cacheDir, 'snapshot-staging'),
    tempDir: p.join(cacheDir, 'temp'),
    logsDir: roots.logsDir,
  };
}
