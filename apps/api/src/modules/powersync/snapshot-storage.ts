import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface StoredProfileSnapshotManifest {
  version: string;
  checksumSha256: string;
  generatedAt: string;
}

export interface PublishProfileSnapshotInput {
  snapshotRootDir: string;
  identityId: string;
  sqlitePath: string;
  version: string;
  generatedAt?: string;
}

export interface PublishProfileSnapshotResult {
  snapshotKey: string;
  manifestPath: string;
  databasePath: string;
  manifest: StoredProfileSnapshotManifest;
  fileSize: number;
}

const SQLITE_HEADER = Buffer.from('SQLite format 3\u0000', 'utf8');

export interface ResolvedProfileSnapshot {
  snapshotKey: string;
  manifestPath: string;
  databasePath: string;
}

export function computeProfileSnapshotKey(identityId: string): string {
  return crypto.createHash('sha256').update(identityId).digest('hex');
}

export function resolveProfileSnapshotPaths(
  snapshotRootDir: string,
  identityId: string,
): ResolvedProfileSnapshot {
  const snapshotKey = computeProfileSnapshotKey(identityId);
  const snapshotDir = path.join(snapshotRootDir, snapshotKey);

  return {
    snapshotKey,
    manifestPath: path.join(snapshotDir, 'manifest.json'),
    databasePath: path.join(snapshotDir, 'powersync.sqlite'),
  };
}

export async function readStoredProfileSnapshotManifest(
  snapshotRootDir: string | undefined,
  identityId: string,
): Promise<{
  snapshotKey: string;
  manifest: StoredProfileSnapshotManifest;
  databasePath: string;
} | null> {
  if (!snapshotRootDir) {
    return null;
  }

  const resolved = resolveProfileSnapshotPaths(snapshotRootDir, identityId);
  if (!fs.existsSync(resolved.manifestPath) || !fs.existsSync(resolved.databasePath)) {
    return null;
  }

  const raw = await fs.promises.readFile(resolved.manifestPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<StoredProfileSnapshotManifest>;

  if (
    typeof parsed.version !== 'string' ||
    typeof parsed.checksumSha256 !== 'string' ||
    typeof parsed.generatedAt !== 'string'
  ) {
    return null;
  }

  return {
    snapshotKey: resolved.snapshotKey,
    manifest: {
      version: parsed.version,
      checksumSha256: parsed.checksumSha256,
      generatedAt: parsed.generatedAt,
    },
    databasePath: resolved.databasePath,
  };
}

export async function publishProfileSnapshot(
  input: PublishProfileSnapshotInput,
): Promise<PublishProfileSnapshotResult> {
  const resolved = resolveProfileSnapshotPaths(input.snapshotRootDir, input.identityId);
  const sqliteBuffer = await fs.promises.readFile(input.sqlitePath);

  validateSqliteSnapshot(sqliteBuffer);

  const checksumSha256 = crypto.createHash('sha256').update(sqliteBuffer).digest('hex');
  const manifest: StoredProfileSnapshotManifest = {
    version: input.version,
    checksumSha256,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };

  const snapshotDir = path.dirname(resolved.databasePath);
  await fs.promises.mkdir(snapshotDir, { recursive: true });

  const databaseTmpPath = `${resolved.databasePath}.tmp`;
  const manifestTmpPath = `${resolved.manifestPath}.tmp`;

  await fs.promises.writeFile(databaseTmpPath, sqliteBuffer);
  await fs.promises.writeFile(manifestTmpPath, JSON.stringify(manifest, null, 2), 'utf8');
  await fs.promises.rename(databaseTmpPath, resolved.databasePath);
  await fs.promises.rename(manifestTmpPath, resolved.manifestPath);

  return {
    snapshotKey: resolved.snapshotKey,
    manifestPath: resolved.manifestPath,
    databasePath: resolved.databasePath,
    manifest,
    fileSize: sqliteBuffer.byteLength,
  };
}

function validateSqliteSnapshot(buffer: Buffer): void {
  if (buffer.byteLength < SQLITE_HEADER.byteLength) {
    throw new Error('SQLite snapshot file is too small.');
  }

  if (!buffer.subarray(0, SQLITE_HEADER.byteLength).equals(SQLITE_HEADER)) {
    throw new Error('Snapshot file is not a valid SQLite database.');
  }
}
