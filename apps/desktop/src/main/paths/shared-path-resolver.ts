import path from 'node:path';
import type { SharedPathResolver } from './types';
import type { DesktopStorageRoots } from './desktop-storage-roots';

/** Pure derivation; each directory has exactly one lifecycle owner. */
export function createSharedPathResolver(roots: DesktopStorageRoots): SharedPathResolver {
  const sharedDir = path.join(roots.dataRoot, 'shared');
  const authDir = path.join(sharedDir, 'auth');
  const configDir = path.join(roots.configRoot, 'shared', 'preferences');
  const uiDir = path.join(roots.stateRoot, 'shared', 'ui');
  const profilesRegistryDir = path.join(sharedDir, 'profiles');
  const cacheDir = roots.cacheRoot;
  return {
    roots,
    sharedDir,
    authDir,
    configDir,
    uiDir,
    profilesRegistryDir,
    deviceIdPath: path.join(authDir, 'device-id'),
    runtimeConfigPath: path.join(configDir, 'desktop-runtime.json'),
    profileAccessWindowStatePath: path.join(uiDir, 'profile-access-window-state.json'),
    registryPath: path.join(profilesRegistryDir, 'registry.json'),
    cacheDir,
    snapshotStagingDir: path.join(cacheDir, 'snapshot-staging'),
    downloadsDir: path.join(cacheDir, 'downloads-internal'),
    tempDir: path.join(cacheDir, 'temp'),
    logsDir: roots.logsDir,
  };
}
