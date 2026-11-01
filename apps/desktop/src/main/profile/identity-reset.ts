import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '@memoflow/utils/logger';
import type { DesktopStorageRoots } from '../paths';

const logger = createLogger('IdentityReset');

/**
 * One-shot identity reset for the #785 account-model change.
 *
 * The account model moved from `guest` Profiles guarded by numeric PINs to
 * local accounts guarded by passwords, and #785 decided that every existing
 * local identity is disposable test data. This module removes the previous
 * identity tree exactly once, before the Profile registry is loaded, so the new
 * model starts from a clean state and no stale envelope can be misread.
 *
 * 一次性身份重置：在注册表加载之前删除旧身份树，写入版本化标记后不再执行。
 */

export const IDENTITY_RESET_VERSION = 1;
export const IDENTITY_RESET_MARKER_FILENAME = 'identity-reset-v1.json';

export interface IdentityResetOutcome {
  /** True only for the call that performed the deletion. */
  executed: boolean;
  /** Absolute paths deleted in this call, in deletion order. */
  removedPaths: string[];
}

export function identityResetMarkerPath(roots: DesktopStorageRoots): string {
  return path.join(roots.dataRoot, IDENTITY_RESET_MARKER_FILENAME);
}

/**
 * Identity-owned subtrees, derived exactly like the runtime derives them.
 * `shared/secure` holds only credential stores (profile-pins, profile-keys,
 * profile-passwords, cloud-sessions), so each is named explicitly instead of
 * deleting the parent directory. Global settings and device identity stay.
 */
function identityTargets(roots: DesktopStorageRoots): string[] {
  return [
    // Registry, cleanup tombstones, import journals and import prompts.
    path.join(roots.dataRoot, 'shared', 'profiles'),
    // Every per-Profile data directory, including `.deleting-*` trash.
    path.join(roots.dataRoot, 'profiles'),
    path.join(roots.dataRoot, 'shared', 'secure', 'profile-pins'),
    path.join(roots.dataRoot, 'shared', 'secure', 'profile-passwords'),
    path.join(roots.dataRoot, 'shared', 'secure', 'profile-keys'),
    path.join(roots.dataRoot, 'shared', 'secure', 'cloud-sessions'),
    // Per-Profile window/UI state owned by the same identities.
    path.join(roots.stateRoot, 'profiles'),
  ];
}

function assertSafeDataRoot(roots: DesktopStorageRoots): void {
  const p = roots.platform === 'win32' ? path.win32 : path.posix;
  const resolved = p.resolve(roots.dataRoot);
  if (!p.isAbsolute(resolved) || resolved === p.parse(resolved).root) {
    throw new Error(`Refusing identity reset outside a scoped data root: ${resolved}`);
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.promises.lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function writeMarker(roots: DesktopStorageRoots, executedAt: number): Promise<void> {
  const marker = identityResetMarkerPath(roots);
  await fs.promises.mkdir(path.dirname(marker), { recursive: true, mode: 0o700 });
  const temp = `${marker}.tmp`;
  await fs.promises.writeFile(
    temp,
    JSON.stringify({
      version: IDENTITY_RESET_VERSION,
      executedAt: new Date(executedAt).toISOString(),
    }),
    { encoding: 'utf8', mode: 0o600 },
  );
  await fs.promises.rename(temp, marker);
}

/**
 * Runs the reset at most once per data root. A present marker is the only
 * authority: the marker is written after every target is gone, so an
 * interrupted run repeats the deletion instead of leaving a half-cleared state.
 */
export async function runIdentityResetOnce(
  roots: DesktopStorageRoots,
  now: number = Date.now(),
): Promise<IdentityResetOutcome> {
  assertSafeDataRoot(roots);
  const marker = identityResetMarkerPath(roots);
  if (await exists(marker)) return { executed: false, removedPaths: [] };

  const removedPaths: string[] = [];
  for (const target of identityTargets(roots)) {
    if (!(await exists(target))) continue;
    await fs.promises.rm(target, { recursive: true, force: true });
    removedPaths.push(target);
  }
  await writeMarker(roots, now);

  logger.info('Identity reset executed', { removedCount: removedPaths.length });
  return { executed: true, removedPaths };
}
