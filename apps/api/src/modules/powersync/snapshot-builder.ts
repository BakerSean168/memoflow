import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { PowerSyncDatabase } from '@powersync/node';
import type {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/common';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';
import { publishProfileSnapshot, type PublishProfileSnapshotResult } from './snapshot-storage.js';

const DEFAULT_POWERSYNC_AUDIENCE = 'powersync-dev';
const DEFAULT_SYNC_WAIT_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_TOKEN_EXPIRES_IN_SECONDS = 5 * 60;

export interface BuildProfileSnapshotInput {
  identityId: string;
  snapshotRootDir: string;
  powersyncUrl: string;
  privateKey: string;
  keyId: string;
  version: string;
  generatedAt?: string;
  tempRootDir?: string;
  syncWaitTimeoutMs?: number;
  tokenExpiresInSeconds?: number;
  audience?: string;
}

export interface BuildProfileSnapshotResult extends PublishProfileSnapshotResult {}

class StaticPowerSyncConnector implements PowerSyncBackendConnector {
  constructor(private readonly fetcher: () => Promise<PowerSyncCredentials>) {}

  async fetchCredentials(): Promise<PowerSyncCredentials> {
    return this.fetcher();
  }

  async uploadData(_database: AbstractPowerSyncDatabase): Promise<void> {
    // Snapshot builders should never have local CRUD to upload.
  }
}

export function createInternalPowerSyncCredentials(
  input: Pick<
    BuildProfileSnapshotInput,
    'identityId' | 'powersyncUrl' | 'privateKey' | 'keyId' | 'audience' | 'tokenExpiresInSeconds'
  >,
): PowerSyncCredentials {
  const expiresInSeconds = input.tokenExpiresInSeconds ?? DEFAULT_TOKEN_EXPIRES_IN_SECONDS;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  const token = jwt.sign(
    {
      sub: input.identityId,
      aud: input.audience ?? DEFAULT_POWERSYNC_AUDIENCE,
    },
    input.privateKey,
    {
      algorithm: 'RS256',
      expiresIn: expiresInSeconds,
      keyid: input.keyId,
    } as jwt.SignOptions,
  );

  return {
    endpoint: input.powersyncUrl,
    token,
    expiresAt,
  };
}

export async function purgePowerSyncClientId(
  db: Pick<AbstractPowerSyncDatabase, 'execute'>,
): Promise<void> {
  await db.execute(`DELETE FROM ps_kv WHERE key = 'client_id'`);
}

export async function vacuumSqliteIntoSnapshot(
  db: Pick<AbstractPowerSyncDatabase, 'execute'>,
  outputPath: string,
): Promise<void> {
  await db.execute(`VACUUM INTO ${escapeSqliteStringLiteral(path.resolve(outputPath))}`);
}

export async function buildProfileSnapshot(
  input: BuildProfileSnapshotInput,
): Promise<BuildProfileSnapshotResult> {
  const snapshotRootDir = path.resolve(input.snapshotRootDir);
  const tempRootDir = path.resolve(input.tempRootDir ?? os.tmpdir());
  const syncWaitTimeoutMs = input.syncWaitTimeoutMs ?? DEFAULT_SYNC_WAIT_TIMEOUT_MS;

  await fs.promises.mkdir(snapshotRootDir, { recursive: true });
  await fs.promises.mkdir(tempRootDir, { recursive: true });

  const tempDir = await fs.promises.mkdtemp(path.join(tempRootDir, 'powersync-profile-snapshot-'));
  const tempDatabasePath = path.join(tempDir, 'powersync-working.sqlite');
  const exportedSnapshotPath = path.join(tempDir, 'powersync-portable.sqlite');

  const connector = new StaticPowerSyncConnector(async () =>
    createInternalPowerSyncCredentials(input),
  );
  const db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: {
      dbFilename: tempDatabasePath,
    },
  });

  try {
    await db.waitForReady();
    await db.connect(connector);
    await waitForFirstSyncWithTimeout(db, syncWaitTimeoutMs);
    await purgePowerSyncClientId(db);
    await vacuumSqliteIntoSnapshot(db, exportedSnapshotPath);

    const published = await publishProfileSnapshot({
      snapshotRootDir,
      identityId: input.identityId,
      sqlitePath: exportedSnapshotPath,
      version: input.version,
      generatedAt: input.generatedAt,
    });

    return published;
  } finally {
    await db.close().catch(() => undefined);
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function waitForFirstSyncWithTimeout(
  db: Pick<AbstractPowerSyncDatabase, 'waitForFirstSync'>,
  timeoutMs: number,
): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      db.waitForFirstSync(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`PowerSync first sync timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function escapeSqliteStringLiteral(value: string): string {
  return `'${value.split("'").join("''")}'`;
}
