import fs from 'node:fs';
import type { ProfilePathResolver } from './types';

/**
 * Creates only the private directories needed when opening a Profile.
 */
export function ensureProfileDirs(resolver: ProfilePathResolver): void {
  const dirs = [
    resolver.profileDir,
    resolver.authDir,
    resolver.dbDir,
    resolver.storageDir,
    resolver.uiDir,
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}
