import fs from 'node:fs';
import type { SharedPathResolver, ProfilePathResolver } from './types';

/**
 * Ensures all shared directories exist on disk.
 */
export function ensureSharedDirs(resolver: SharedPathResolver): void {
  const dirs = [
    resolver.sharedDir,
    resolver.authDir,
    resolver.configDir,
    resolver.uiDir,
    resolver.profilesRegistryDir,
    resolver.cacheDir,
    resolver.snapshotStagingDir,
    resolver.downloadsDir,
    resolver.tempDir,
    resolver.logsDir,
    // User-selected files are created on demand by the file IPC handlers.
    // Creating empty folders at startup can clutter a user's home/Documents.
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Ensures all profile-specific directories exist on disk.
 */
export function ensureProfileDirs(resolver: ProfilePathResolver): void {
  const dirs = [
    resolver.profileDir,
    resolver.authDir,
    resolver.dbDir,
    resolver.storageDir,
    resolver.repositoryStorageDir,
    resolver.knowledgeNotesDir,
    resolver.attachmentsDir,
    resolver.uiDir,
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
