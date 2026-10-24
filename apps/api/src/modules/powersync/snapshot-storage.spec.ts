import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeProfileSnapshotKey,
  publishProfileSnapshot,
  readStoredProfileSnapshotManifest,
} from './snapshot-storage.js';

function createSqliteBuffer(): Buffer {
  return Buffer.concat([Buffer.from('SQLite format 3\u0000', 'utf8'), Buffer.alloc(512)]);
}

describe('snapshot-storage', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'powersync-snapshot-storage-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('publishes a sqlite snapshot into the API snapshot layout', async () => {
    const identityId = '7e92ca52-b331-4cbb-9ecc-2b1f1471c370';
    const sqlitePath = path.join(tmpDir, 'source.sqlite');
    await fs.promises.writeFile(sqlitePath, createSqliteBuffer());

    const result = await publishProfileSnapshot({
      snapshotRootDir: path.join(tmpDir, 'snapshots'),
      identityId,
      sqlitePath,
      version: '2026-05-18T00:00:00Z',
      generatedAt: '2026-05-18T00:00:00Z',
    });

    expect(result.snapshotKey).toBe(computeProfileSnapshotKey(identityId));
    expect(fs.existsSync(result.databasePath)).toBe(true);
    expect(fs.existsSync(result.manifestPath)).toBe(true);

    const manifest = await readStoredProfileSnapshotManifest(
      path.join(tmpDir, 'snapshots'),
      identityId,
    );
    expect(manifest).not.toBeNull();
    expect(manifest?.manifest.version).toBe('2026-05-18T00:00:00Z');
    expect(manifest?.manifest.generatedAt).toBe('2026-05-18T00:00:00Z');
  });

  it('rejects non-sqlite input files', async () => {
    const sqlitePath = path.join(tmpDir, 'invalid.sqlite');
    await fs.promises.writeFile(sqlitePath, 'not-a-sqlite-file', 'utf8');

    await expect(
      publishProfileSnapshot({
        snapshotRootDir: path.join(tmpDir, 'snapshots'),
        identityId: 'identity-1',
        sqlitePath,
        version: '2026-05-18T00:00:00Z',
      }),
    ).rejects.toThrow('Snapshot file is not a valid SQLite database.');
  });
});
