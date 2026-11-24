import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  createProfilePathResolver,
  createSharedPathResolver,
  type DesktopStorageRoots,
} from '../paths';
import { getProfilePartition, getProfilePartitionDirectoryName } from './profile-partition';
import { syncProfileDirectory, writeProfileDurableFile } from './profile-durable-file';

export const LocalProfileIdSchema = z.string().regex(/^p_[a-f0-9]{24}$/);

/**
 * Stage of the unified Profile deletion flow. Logged and classified, never shown
 * to users verbatim.
 */
export type ProfileCleanupStage =
  | 'marker'
  | 'business-directory'
  | 'state-directory'
  | 'imports'
  | 'staging'
  | 'session-data'
  | 'partition-directory'
  | 'marker-removal'
  | 'cloud-session'
  | 'credential'
  | 'profile-key'
  | 'remembered-key'
  | 'registry';

/** Operator-facing failure category for a failed cleanup stage. */
export type ProfileCleanupErrorCategory = 'IN_USE' | 'PERMISSION' | 'IO' | 'UNKNOWN';

export interface ProfileCleanupFailure {
  stage: ProfileCleanupStage | 'unknown';
  category: ProfileCleanupErrorCategory;
  systemCode: string | null;
}

const CATEGORY_BY_SYSTEM_CODE: Record<string, ProfileCleanupErrorCategory> = {
  EBUSY: 'IN_USE',
  ETXTBSY: 'IN_USE',
  // Windows reports a directory held by another handle as EPERM. Classifying it
  // as in-use keeps operators from chasing a permissions problem that is not one.
  EPERM: 'IN_USE',
  EACCES: 'PERMISSION',
  EROFS: 'PERMISSION',
  EIO: 'IO',
  ENOSPC: 'IO',
  EMFILE: 'IO',
  ENFILE: 'IO',
  ENOTDIR: 'IO',
  EISDIR: 'IO',
};

function systemCodeOf(error: unknown): string | null {
  const code = (error as NodeJS.ErrnoException | null | undefined)?.code;
  return typeof code === 'string' ? code : null;
}

/** Maps a filesystem error to the category surfaced through logs and IPC. */
export function categorizeProfileCleanupError(error: unknown): ProfileCleanupErrorCategory {
  const code = systemCodeOf(error);
  return code ? (CATEGORY_BY_SYSTEM_CODE[code] ?? 'UNKNOWN') : 'UNKNOWN';
}

/** Failure carrying the deletion stage and system error code for diagnostics. */
export class ProfileCleanupError extends Error {
  readonly stage: ProfileCleanupStage;
  readonly category: ProfileCleanupErrorCategory;
  readonly systemCode: string | null;

  constructor(stage: ProfileCleanupStage, cause: unknown) {
    const systemCode = systemCodeOf(cause);
    super(`Profile cleanup failed at ${stage}${systemCode ? ` (${systemCode})` : ''}`);
    this.name = 'ProfileCleanupError';
    this.stage = stage;
    this.systemCode = systemCode;
    this.category = categorizeProfileCleanupError(cause);
  }
}

export function wrapProfileCleanupError(
  stage: ProfileCleanupStage,
  cause: unknown,
): ProfileCleanupError {
  return cause instanceof ProfileCleanupError ? cause : new ProfileCleanupError(stage, cause);
}

/** Extracts stable diagnostics from any error thrown by the removal flow. */
export function describeProfileCleanupFailure(error: unknown): ProfileCleanupFailure {
  if (error instanceof ProfileCleanupError) {
    return { stage: error.stage, category: error.category, systemCode: error.systemCode };
  }
  return {
    stage: 'unknown',
    category: categorizeProfileCleanupError(error),
    systemCode: systemCodeOf(error),
  };
}

/** Durable phase of a deletion request; diagnostic only, recovery is idempotent. */
export type ProfileCleanupPhase = 'requested' | 'content-cleaned' | 'partition-pending';

interface ProfileCleanupMarkerFile {
  schemaVersion: 2;
  profileId: string;
  phase: ProfileCleanupPhase;
  requestedAt: string;
  updatedAt: string;
  lastFailure: ProfileCleanupFailure | null;
}

/**
 * The subset of Electron's `Session` this flow uses. Electron 44 exposes
 * `clearData`, which clears more data classes than `clearStorageData`; older or
 * stubbed sessions only need the two legacy calls.
 */
export interface ProfilePartitionSession {
  clearData?(): Promise<void>;
  clearStorageData(): Promise<void>;
  clearCache(): Promise<void>;
}

export interface ProfileCleanupOutcome {
  /** False while the Chromium partition directory remains for cold-start cleanup. */
  partitionRemoved: boolean;
}

const PROFILE_CLEANUP_SCHEMA_VERSION = 2 as const;

/**
 * Unified two-phase Profile deletion.
 *
 * Phase 1 runs in the live process and only clears data the Electron Session
 * API can safely clear while the partition is still open: business/import
 * directories, staging, secure credentials, the registry entry, and the
 * partition's Chromium data. The partition *directory* is deliberately never
 * `fs.rm`-ed here: on Windows its Session Storage LOCK / WebStorage
 * QuotaManager files stay held by this same process, which is what left the
 * account half-deleted before #1078.
 *
 * Phase 2 runs on the next cold start, before any window or `Session` for the
 * partition exists: it removes the directory and every leftover credential,
 * registry entry and marker. A durable marker written first blocks reopening
 * the target Profile in the meantime, so an interrupted deletion converges
 * instead of resurrecting an empty account.
 */
export class ProfileCleanup {
  constructor(
    private readonly roots: DesktopStorageRoots,
    private readonly partitionSession: (partition: string) => ProfilePartitionSession,
  ) {}
  private marker(profileId: string) {
    LocalProfileIdSchema.parse(profileId);
    return path.join(this.roots.dataRoot, 'shared', 'profiles', 'cleanup', `${profileId}.json`);
  }
  private partitionDirectory(profileId: string): string {
    return path.join(
      this.roots.electronSessionData,
      'Partitions',
      getProfilePartitionDirectoryName(profileId),
    );
  }
  async isPending(profileId: string): Promise<boolean> {
    try {
      await fs.access(this.marker(profileId));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
  async pending(): Promise<string[]> {
    try {
      const names = await fs.readdir(
        path.join(this.roots.dataRoot, 'shared', 'profiles', 'cleanup'),
      );
      return names
        .filter((name) => name.endsWith('.json'))
        .map((name) => LocalProfileIdSchema.parse(name.slice(0, -5)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  /**
   * Phase 1: the account stops being openable and all data that can be removed
   * safely in the live process is removed. The partition directory removal is
   * deferred, so a live session handle can no longer fail the deletion.
   */
  async remove(profileId: string, finalize: () => Promise<void>): Promise<ProfileCleanupOutcome> {
    await this.writeMarker(profileId, 'requested', null);
    await this.removeContent(profileId);
    await this.writeMarker(profileId, 'content-cleaned', null);
    try {
      await this.clearSessionData(profileId);
    } catch (error) {
      throw wrapProfileCleanupError('session-data', error);
    }
    // Business data is gone, so the keys that unlock it may now be discarded.
    await finalize();
    if (await this.partitionDirectoryExists(profileId)) {
      await this.writeMarker(profileId, 'partition-pending', null);
      return { partitionRemoved: false };
    }
    await this.removeMarker(profileId);
    return { partitionRemoved: true };
  }

  /**
   * Phase 2: idempotent cold-start recovery. Must run before any `Session` for
   * the partition is created, so it only touches the filesystem and never calls
   * `partitionSession`. Safe to rerun after an interruption at any stage.
   */
  async recover(profileId: string, finalize: () => Promise<void>): Promise<ProfileCleanupOutcome> {
    await this.removeContent(profileId);
    let partitionFailure: ProfileCleanupError | null = null;
    try {
      await this.removePartitionDirectory(profileId);
    } catch (error) {
      partitionFailure = wrapProfileCleanupError('partition-directory', error);
    }
    // Credentials and the registry entry go even if the directory is still held:
    // a lingering partition must never resurface as a ghost account.
    await finalize();
    if (partitionFailure) {
      // Keep the tombstone so the next cold start retries; no bounded retry loop.
      await this.writeMarker(profileId, 'partition-pending', {
        stage: partitionFailure.stage,
        category: partitionFailure.category,
        systemCode: partitionFailure.systemCode,
      }).catch(() => undefined);
      throw partitionFailure;
    }
    await this.removeMarker(profileId);
    return { partitionRemoved: true };
  }

  private async removeContent(profileId: string): Promise<void> {
    const source = createProfilePathResolver(this.roots, profileId).profileDir;
    const trash = path.join(this.roots.dataRoot, 'profiles', `.deleting-${profileId}`);
    try {
      await fs.mkdir(path.dirname(source), { recursive: true, mode: 0o700 });
      await fs.rename(source, trash);
      await syncProfileDirectory(path.dirname(source));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw wrapProfileCleanupError('business-directory', error);
      }
    }
    await this.removePath(trash, 'business-directory');
    await this.removePath(
      path.join(this.roots.stateRoot, 'profiles', profileId),
      'state-directory',
    );
    try {
      await syncProfileDirectory(path.dirname(source));
    } catch (error) {
      throw wrapProfileCleanupError('business-directory', error);
    }
    // Import recovery material belongs to the target Profile and must not outlive its key.
    const imports = path.join(this.roots.dataRoot, 'shared', 'profiles', 'imports');
    await this.removePath(path.join(imports, profileId), 'imports');
    const prompts = path.join(this.roots.dataRoot, 'shared', 'profiles', 'import-prompts');
    await this.removePath(path.join(prompts, `${profileId}.json`), 'imports');
    await this.removePath(
      path.join(createSharedPathResolver(this.roots).snapshotStagingDir, profileId),
      'staging',
    );
  }

  private async clearSessionData(profileId: string): Promise<void> {
    const session = this.partitionSession(getProfilePartition(profileId));
    // `clearData` clears more data classes (cookies, cache, storage, service
    // workers, ...) than `clearStorageData`. Both only clear data inside the
    // live session; neither removes the partition directory or its file locks.
    if (typeof session.clearData === 'function') {
      await session.clearData();
      return;
    }
    await session.clearStorageData();
    await session.clearCache();
  }

  private async partitionDirectoryExists(profileId: string): Promise<boolean> {
    try {
      return (await fs.lstat(this.partitionDirectory(profileId))).isDirectory();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw wrapProfileCleanupError('partition-directory', error);
    }
  }

  private async removePartitionDirectory(profileId: string): Promise<void> {
    try {
      // One attempt and no retries: a directory still held by another process is
      // reported and the tombstone survives to the next cold start. `force`
      // only tolerates ENOENT; it is not a lock workaround.
      await fs.rm(this.partitionDirectory(profileId), { recursive: true, force: true });
    } catch (error) {
      throw wrapProfileCleanupError('partition-directory', error);
    }
  }

  private async removePath(target: string, stage: ProfileCleanupStage): Promise<void> {
    try {
      await fs.rm(target, { recursive: true, force: true });
    } catch (error) {
      throw wrapProfileCleanupError(stage, error);
    }
  }

  private async readMarker(profileId: string): Promise<{ requestedAt: string } | null> {
    try {
      const raw = await fs.readFile(this.marker(profileId), 'utf8');
      const parsed = JSON.parse(raw) as { requestedAt?: unknown };
      return typeof parsed.requestedAt === 'string' ? { requestedAt: parsed.requestedAt } : null;
    } catch {
      // Missing, unreadable or legacy markers still block reopening and are
      // rewritten with the current schema by the next phase transition.
      return null;
    }
  }

  private async writeMarker(
    profileId: string,
    phase: ProfileCleanupPhase,
    lastFailure: ProfileCleanupFailure | null,
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.readMarker(profileId);
    const marker: ProfileCleanupMarkerFile = {
      schemaVersion: PROFILE_CLEANUP_SCHEMA_VERSION,
      profileId,
      phase,
      requestedAt: existing?.requestedAt ?? now,
      updatedAt: now,
      lastFailure,
    };
    try {
      await writeProfileDurableFile(this.marker(profileId), JSON.stringify(marker));
    } catch (error) {
      throw wrapProfileCleanupError('marker', error);
    }
  }

  private async removeMarker(profileId: string): Promise<void> {
    const marker = this.marker(profileId);
    try {
      await fs.rm(marker, { force: true });
      await syncProfileDirectory(path.dirname(marker));
    } catch (error) {
      // The marker directory may already be gone on a repeated convergence; that
      // is success, not a new failure to report.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw wrapProfileCleanupError('marker-removal', error);
    }
  }
}
