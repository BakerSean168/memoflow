import { existsSync } from 'fs';
import path from 'path';

const PRELOAD_FILENAME = 'preload.cjs';

export function resolvePreloadPath(currentDir: string): string {
  const candidates = [
    path.resolve(currentDir, PRELOAD_FILENAME),
    path.resolve(currentDir, '..', PRELOAD_FILENAME),
    path.resolve(currentDir, '..', '..', PRELOAD_FILENAME),
  ];

  const resolved = candidates.find((candidate) => existsSync(candidate));
  return resolved ?? candidates[0];
}

export function hasResolvedPreload(currentDir: string): boolean {
  return existsSync(resolvePreloadPath(currentDir));
}
