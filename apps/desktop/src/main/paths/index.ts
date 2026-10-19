export type { SharedPathResolver, ProfilePathResolver } from './types';
export { createSharedPathResolver } from './shared-path-resolver';
export { createProfilePathResolver, computeProfileId } from './profile-path-resolver';
export { ensureProfileDirs } from './ensure-dirs';
export * from './vault-path';

export { resolveDesktopStorageRoots } from './desktop-storage-roots';
export type { DesktopStorageRoots, DesktopRuntimeChannel } from './desktop-storage-roots';
