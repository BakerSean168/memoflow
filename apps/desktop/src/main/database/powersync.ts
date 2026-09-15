/**
 * @file PowerSync Integration for Electron Main Process
 * @description
 *
 * Initialises a PowerSync database (backed by its own SQLite file) that keeps
 * the local dataset in sync with the Postgres backend via the self-hosted
 * PowerSync Service.
 *
 * Design decisions:
 *   - PowerSync's Node SDK (`@powersync/node`) internally manages its own
 *     SQLite connection, but it now points at the unified desktop business
 *     database file so sync and local business reads observe the same data.
 *   - The connector obtains a PowerSync-specific RS256 JWT from the API's
 *     `/powersync/token` endpoint, authenticating via the existing HS256 access token.
 *   - CRUD uploads are batched to `/powersync/crud` in the API.
 *   - Profile runtime opens local-only first via `openPowerSyncLocalOnly()`, then
 *     promotes to sync with `ensurePowerSyncSyncMode()` after authentication.
 *     Use `shutdownPowerSync()` on profile teardown / app quit (data preserved).
 */

import { PowerSyncDatabase } from '@powersync/node';
import type {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
  CrudTransaction,
} from '@powersync/common';
import { BrowserWindow, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { Worker } from 'node:worker_threads';

import { PowerSyncAppSchema } from '@memoflow/powersync-schema';
import { getApiBaseUrl } from '../utils/api-config';
import { serializeCrudTransaction } from './powersync-crud';
import { normalizePowerSyncTableName, POWER_SYNC_CHANGE_TABLES } from './powersync-table-changes';
import { resolvePackagedWorkerPath } from './packaged-worker-path';

export interface CloudCredentialProvider {
  getAccessToken(): Promise<string | null>;
}

const NON_SYNCABLE_LOCAL_TABLES = ['accounts'] as const;

const PRE_HYDRATION_BOOTSTRAP_SYNC_TABLES = [
  'user_preference_records',
  'repositories',
] as const;

// ──────────────────────────────────────────────
// Module state
// ──────────────────────────────────────────────

let powerSyncDb: PowerSyncDatabase | null = null;
let syncConnected = false;
let currentDbPath: string | null = null;

// Concurrency guard — prevent duplicate local-only opens when two callers race.
let openingPromise: Promise<PowerSyncDatabase> | null = null;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function ensureDbDirectory(dbPath: string): string {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return dbPath;
}

function assertCompatibleDbPath(dbPath: string): void {
  if (powerSyncDb && currentDbPath && currentDbPath !== dbPath) {
    throw new Error(
      `PowerSync database is already open for another profile: ${currentDbPath} != ${dbPath}`,
    );
  }
}

function createPowerSyncDatabase(dbPath: string): PowerSyncDatabase {
  return new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: {
      dbFilename: dbPath,
      openWorker: (filename, options) => {
        const resolvedFilename = resolvePackagedWorkerPath(filename, {
          isPackaged: app.isPackaged,
        });

        return new Worker(resolvedFilename, options);
      },
    },
  });
}

async function purgeNonSyncableLocalCrud(
  db: Pick<PowerSyncDatabase, 'writeTransaction'>,
): Promise<void> {
  const placeholders = NON_SYNCABLE_LOCAL_TABLES.map(() => '?').join(', ');

  await db.writeTransaction(async (tx) => {
    const queuedCrud = await tx.get<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM ps_crud
       WHERE json_extract(data, '$.type') IN (${placeholders})`,
      [...NON_SYNCABLE_LOCAL_TABLES],
    );

    const queuedRows = await tx.get<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM ps_updated_rows
       WHERE row_type IN (${placeholders})`,
      [...NON_SYNCABLE_LOCAL_TABLES],
    );

    if (queuedCrud.count === 0 && queuedRows.count === 0) {
      return;
    }

    console.log('[PowerSync] Purging non-syncable local CRUD rows', {
      queuedCrud: queuedCrud.count,
      queuedRows: queuedRows.count,
      tables: NON_SYNCABLE_LOCAL_TABLES,
    });

    await tx.execute(
      `DELETE FROM ps_crud
       WHERE json_extract(data, '$.type') IN (${placeholders})`,
      [...NON_SYNCABLE_LOCAL_TABLES],
    );

    await tx.execute(
      `DELETE FROM ps_updated_rows
       WHERE row_type IN (${placeholders})`,
      [...NON_SYNCABLE_LOCAL_TABLES],
    );
  });
}

async function purgePreHydrationBootstrapCrud(
  db: Pick<PowerSyncDatabase, 'writeTransaction'>,
): Promise<void> {
  const placeholders = PRE_HYDRATION_BOOTSTRAP_SYNC_TABLES.map(() => '?').join(', ');

  await db.writeTransaction(async (tx) => {
    const pendingUserBucket = await tx.getOptional<{
      name: string;
      last_op: number;
      last_applied_op: number;
    }>(
      `SELECT name, last_op, last_applied_op
       FROM ps_buckets
       WHERE name LIKE '1#user_data[%]'
         AND last_op > 0
         AND last_applied_op = 0
       ORDER BY id DESC
       LIMIT 1`,
    );

    if (!pendingUserBucket) {
      return;
    }

    const queuedCrud = await tx.get<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM ps_crud
       WHERE json_extract(data, '$.type') IN (${placeholders})`,
      [...PRE_HYDRATION_BOOTSTRAP_SYNC_TABLES],
    );

    const queuedRows = await tx.get<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM ps_updated_rows
       WHERE row_type IN (${placeholders})`,
      [...PRE_HYDRATION_BOOTSTRAP_SYNC_TABLES],
    );

    if (queuedCrud.count === 0 && queuedRows.count === 0) {
      return;
    }

    console.log('[PowerSync] Purging pre-hydration bootstrap CRUD rows', {
      bucket: pendingUserBucket.name,
      lastOp: pendingUserBucket.last_op,
      lastAppliedOp: pendingUserBucket.last_applied_op,
      queuedCrud: queuedCrud.count,
      queuedRows: queuedRows.count,
      tables: PRE_HYDRATION_BOOTSTRAP_SYNC_TABLES,
    });

    await tx.execute(
      `DELETE FROM ps_crud
       WHERE json_extract(data, '$.type') IN (${placeholders})`,
      [...PRE_HYDRATION_BOOTSTRAP_SYNC_TABLES],
    );

    await tx.execute(
      `DELETE FROM ps_updated_rows
       WHERE row_type IN (${placeholders})`,
      [...PRE_HYDRATION_BOOTSTRAP_SYNC_TABLES],
    );
  });
}

// ──────────────────────────────────────────────
// Backend Connector
// ──────────────────────────────────────────────

class DesktopPowerSyncConnector implements PowerSyncBackendConnector {
  private readonly apiBaseUrl: string;
  private readonly credentialProvider: CloudCredentialProvider;

  constructor(credentialProvider: CloudCredentialProvider) {
    this.apiBaseUrl = getApiBaseUrl();
    this.credentialProvider = credentialProvider;
  }

  /**
   * Fetches a short-lived RS256 JWT from the API, authenticating via the
   * existing HS256 access token stored in safeStorage.
   */
  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const accessToken = await this.credentialProvider.getAccessToken();

    if (!accessToken) {
      throw new Error(
        '[PowerSync] No cloud-eligible access token — guest/offline profiles stay local',
      );
    }

    const response = await fetch(`${this.apiBaseUrl}/powersync/token`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`[PowerSync] Failed to fetch credentials: ${response.status} ${body}`);
    }

    const payload = (await response.json()) as {
      ok: boolean;
      data?: {
        token?: string;
        endpoint?: string;
        expiresIn?: number;
      };
      message?: string;
    };

    if (
      !payload?.ok ||
      !payload.data?.token ||
      !payload.data?.endpoint ||
      !payload.data?.expiresIn
    ) {
      throw new Error(
        `[PowerSync] Invalid credentials response contract from API: ${JSON.stringify(payload)}`,
      );
    }

    const expiresAt = new Date(Date.now() + payload.data.expiresIn * 1000);
    console.log('[PowerSync] Credentials fetched', {
      endpoint: payload.data.endpoint,
      expiresAt: expiresAt.toISOString(),
      tokenPrefix: `${payload.data.token.slice(0, 10)}...`,
    });

    return {
      endpoint: payload.data.endpoint,
      token: payload.data.token,
      expiresAt,
    };
  }

  /**
   * Uploads local CRUD operations to the backend.
   * The API's `/powersync/crud` endpoint applies them inside a Prisma $transaction.
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const accessToken = await this.credentialProvider.getAccessToken();

    if (!accessToken) {
      throw new Error('[PowerSync] No cloud-eligible access token — cannot upload data');
    }

    let transaction: CrudTransaction | null;

    while ((transaction = await database.getNextCrudTransaction()) !== null) {
      try {
        const ops = serializeCrudTransaction(transaction);

        const tableCounts = ops.reduce<Record<string, number>>((acc, op) => {
          acc[op.type] = (acc[op.type] ?? 0) + 1;
          return acc;
        }, {});
        const includesGoals = Object.keys(tableCounts).some((table) => table.includes('goal'));
        console.log('[PowerSync] Uploading CRUD transaction', {
          opCount: ops.length,
          tableCounts,
          includesGoals,
        });

        const response = await fetch(`${this.apiBaseUrl}/powersync/crud`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transactions: [
              {
                ops,
              },
            ],
          }),
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`[PowerSync] CRUD upload failed: ${response.status} ${body}`);
        }

        console.log('[PowerSync] CRUD transaction uploaded successfully', {
          opCount: ops.length,
          includesGoals,
        });

        await transaction.complete();
      } catch (error) {
        console.error('[PowerSync] CRUD upload error:', error);
        throw error;
      }
    }
  }
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Opens the PowerSync database in local-only mode (no sync).
 *
 * Used whenever a Profile is unlocked before cloud connectivity is available.
 *
 * @param dbPath - Required per-profile database path.
 */
export async function openPowerSyncLocalOnly(dbPath: string): Promise<PowerSyncDatabase> {
  assertCompatibleDbPath(dbPath);

  if (powerSyncDb) {
    console.log('[PowerSync] Already open (reusing existing instance)');
    return powerSyncDb;
  }
  if (openingPromise) {
    console.log('[PowerSync] Local-only open already in progress, waiting…');
    return openingPromise;
  }

  openingPromise = (async () => {
    const resolvedDbPath = ensureDbDirectory(dbPath);

    console.log(`[PowerSync] Opening local-only database: ${resolvedDbPath}`);

    const db = createPowerSyncDatabase(resolvedDbPath);
    console.log('[PowerSync] Waiting for local-only database to become ready...');
    await db.waitForReady();
    console.log('[PowerSync] Local-only database is ready');

    powerSyncDb = db;
    syncConnected = false;
    currentDbPath = resolvedDbPath;

    // Do NOT call db.connect(connector) — local-only mode
    // Just initialize the database and start change broadcast
    startChangeBroadcast(db);

    console.log('[PowerSync] Local-only mode active (no sync)');
    return db;
  })();

  try {
    return await openingPromise;
  } finally {
    openingPromise = null;
  }
}

/**
 * Ensures the PowerSync database is running in sync mode.
 *
 * Requires an already prepared local-only profile database (from
 * `openPowerSyncLocalOnly`). Promotes it by attaching a connector.
 */
export async function ensurePowerSyncSyncMode(
  credentialProvider: CloudCredentialProvider,
): Promise<PowerSyncDatabase> {
  if (!powerSyncDb) {
    throw new Error('PowerSync sync mode requires an already prepared profile-local database');
  }

  if (syncConnected) {
    console.log('[PowerSync] Already in sync mode');
    return powerSyncDb;
  }

  await purgeNonSyncableLocalCrud(powerSyncDb);
  await purgePreHydrationBootstrapCrud(powerSyncDb);
  const connector = new DesktopPowerSyncConnector(credentialProvider);
  await powerSyncDb.connect(connector);
  syncConnected = true;
  console.log('[PowerSync] Promoted to sync mode');
  return powerSyncDb;
}

/** Disconnect cloud sync while keeping the active Profile database open locally. */
export async function disablePowerSyncSyncMode(): Promise<void> {
  if (!powerSyncDb || !syncConnected) return;
  await powerSyncDb.disconnect();
  syncConnected = false;
  console.log('[PowerSync] Cloud sync disconnected; local Profile remains open');
}

/**
 * Gracefully shuts down the PowerSync database WITHOUT wiping local data.
 * Use on app quit to preserve the sync cache for the next cold start.
 */
export async function shutdownPowerSync(): Promise<void> {
  if (!powerSyncDb) return;

  try {
    stopChangeBroadcast();
    await powerSyncDb.disconnect();
    console.log('[PowerSync] Shut down gracefully (data preserved)');
  } catch (error) {
    console.error('[PowerSync] Error during shutdown:', error);
  } finally {
    syncConnected = false;
    powerSyncDb = null;
    currentDbPath = null;
    // Clear concurrency guard to prevent stale in-flight opens from restoring old instances
    openingPromise = null;
  }
}

/**
 * Returns the active PowerSync database instance, or null if not connected.
 */
export function getPowerSyncDatabase(): PowerSyncDatabase | null {
  return powerSyncDb;
}

// ──────────────────────────────────────────────
// Change Broadcast
// ──────────────────────────────────────────────

/** Unsubscribe handle returned by onChange; stored so we can tear it down. */
let onChangeDispose: (() => void) | null = null;

/**
 * Starts listening for table changes on the PowerSync database and
 * broadcasts `db:changed` events to all renderer windows.
 *
 * The event payload is `{ tables: string[] }` — table names only.
 * Renderers re-fetch affected data via their existing IPC adapters.
 */
function startChangeBroadcast(db: PowerSyncDatabase): void {
  if (onChangeDispose) return; // already listening

  onChangeDispose = db.onChange(
    {
      onChange: (event) => {
        const tables = [...new Set(event.changedTables.map(normalizePowerSyncTableName))];
        if (tables.length === 0) return;

        const includesGoals = tables.some((table) => table.includes('goal'));
        console.log('[PowerSync] Changed tables detected', {
          tables,
          includesGoals,
        });

        // Broadcast to every open BrowserWindow
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send('db:changed', { tables });
          }
        }
      },
    },
    { tables: [...POWER_SYNC_CHANGE_TABLES] },
  );

  console.log('[PowerSync] Change broadcast started');
}

/**
 * Stops the change broadcast listener.
 */
function stopChangeBroadcast(): void {
  if (onChangeDispose) {
    onChangeDispose();
    onChangeDispose = null;
    console.log('[PowerSync] Change broadcast stopped');
  }
}
