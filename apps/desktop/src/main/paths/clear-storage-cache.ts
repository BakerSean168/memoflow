import fs from 'node:fs/promises';
import type { DesktopStorageRoots } from './desktop-storage-roots';

/** Session owns cookies/IndexedDB; only its cache API may clear Chromium cache. */
export async function clearDesktopStorageCache(
  roots: DesktopStorageRoots,
  sessions: Iterable<{ clearCache(): Promise<void> }>,
): Promise<void> {
  await Promise.all([...new Set(sessions)].map((session) => session.clearCache()));
  await fs.rm(roots.cacheRoot, { recursive: true, force: true });
}
