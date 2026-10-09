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

const NON_SYNCABLE_LOCAL_TABLES = [
  'accounts',
  'ai_provider_configs',
  'ai_provider_onboarding_sessions',
  'ai_provider_secrets',
  'ai_local_agent_connections',
  'ai_local_conversations',
  'ai_local_conversation_items',
] as const;

const PRE_HYDRATION_BOOTSTRAP_SYNC_TABLES = ['user_preference_records'] as const;

// ──────────────────────────────────────────────
// Module state
// ──────────────────────────────────────────────

interface ProfileDatabaseInstance {
  db: PowerSyncDatabase;
  path: string;
  phase: 'opening' | 'open' | 'closing' | 'close-failed';
  ready: Promise<void>;
  syncConnected: boolean;
  syncTail: Promise<void>;
  syncGeneration: number;
  syncController: AbortController | null;
  disconnecting: Promise<void> | null;
  closing: Promise<void> | null;
}

let powerSyncInstance: ProfileDatabaseInstance | null = null;

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

  constructor(
    credentialProvider: CloudCredentialProvider,
    private readonly signal: AbortSignal,
  ) {
    this.apiBaseUrl = getApiBaseUrl();
    this.credentialProvider = credentialProvider;
  }

  /**
   * Fetches a short-lived RS256 JWT from the API, authenticating via the
   * existing HS256 access token stored in safeStorage.
   */
  async fetchCredentials(): Promise<PowerSyncCredentials> {
    this.signal.throwIfAborted();
    const accessToken = await this.credentialProvider.getAccessToken();
    this.signal.throwIfAborted();

    if (!accessToken) {
      throw new Error(
        '[PowerSync] No cloud-eligible access token — guest/offline profiles stay local',
      );
    }

    const response = await fetch(`${this.apiBaseUrl}/powersync/token`, {
      signal: AbortSignal.any([this.signal, AbortSignal.timeout(5_000)]),
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
    this.signal.throwIfAborted();
    const accessToken = await this.credentialProvider.getAccessToken();
    this.signal.throwIfAborted();

    if (!accessToken) {
      throw new Error('[PowerSync] No cloud-eligible access token — cannot upload data');
    }

    let transaction: CrudTransaction | null;

    while ((transaction = await database.getNextCrudTransaction()) !== null) {
      try {
        this.signal.throwIfAborted();
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
          signal: AbortSignal.any([this.signal, AbortSignal.timeout(15_000)]),
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
  const resolvedDbPath = path.resolve(dbPath);
  let instance = powerSyncInstance;
  if (instance?.phase === 'closing') {
    await instance.closing;
    return openPowerSyncLocalOnly(resolvedDbPath);
  }
  if (instance?.phase === 'close-failed') {
    throw new Error('PowerSync database close failed; retry shutdown before opening a Profile');
  }
  if (instance && instance.path !== resolvedDbPath) {
    throw new Error(
      `PowerSync database is already open for another profile: ${instance.path} != ${resolvedDbPath}`,
    );
  }
  if (!instance) {
    const db = createPowerSyncDatabase(ensureDbDirectory(resolvedDbPath));
    instance = {
      db,
      path: resolvedDbPath,
      phase: 'opening',
      ready: Promise.resolve().then(() => db.waitForReady()),
      syncConnected: false,
      syncTail: Promise.resolve(),
      syncGeneration: 0,
      syncController: null,
      disconnecting: null,
      closing: null,
    };
    // Own the path and DB before the first await, including failed/late opens.
    powerSyncInstance = instance;
  }
  try {
    await instance.ready;
    if (
      powerSyncInstance !== instance ||
      (instance.phase !== 'opening' && instance.phase !== 'open')
    ) {
      throw new Error('PowerSync database opening was cancelled by Profile shutdown');
    }
    if (instance.phase === 'opening') {
      startChangeBroadcast(instance.db);
      instance.phase = 'open';
      console.log('[PowerSync] Local-only Profile database ready');
    }
    return instance.db;
  } catch (error) {
    if (instance.phase === 'opening') {
      await closeProfileDatabase(instance).catch((closeError) => {
        console.error('[PowerSync] Failed to close an unready database', closeError);
      });
    }
    throw error;
  }
}

function requireOpenInstance(instance: ProfileDatabaseInstance): void {
  if (powerSyncInstance !== instance || instance.phase !== 'open') {
    throw new Error('PowerSync operation requires the current open Profile database');
  }
}

function runSyncOperation<T>(
  instance: ProfileDatabaseInstance,
  operation: () => Promise<T>,
): Promise<T> {
  const task = instance.syncTail.then(() => {
    requireOpenInstance(instance);
    return operation();
  });
  instance.syncTail = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

function closeProfileDatabase(instance: ProfileDatabaseInstance): Promise<void> {
  if (instance.closing) return instance.closing;
  instance.phase = 'closing';
  instance.syncController?.abort();
  const closing = (async () => {
    try {
      // Abort the SDK connection before draining it: connect() may itself be
      // waiting for disconnect to signal cancellation.
      await instance.ready.catch(() => undefined);
      try {
        await stopSync(instance);
      } finally {
        try {
          stopChangeBroadcast();
        } finally {
          await instance.db.close();
        }
      }
      if (powerSyncInstance === instance) powerSyncInstance = null;
      console.log('[PowerSync] Profile database closed (data preserved)');
    } catch (error) {
      // Keep ownership so a retry can close it; a new Profile must not hide it.
      instance.phase = 'close-failed';
      throw error;
    } finally {
      instance.closing = null;
    }
  })();
  instance.closing = closing;
  return closing;
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
  const instance = powerSyncInstance;
  if (!instance || instance.phase !== 'open') {
    throw new Error('PowerSync sync mode requires an already prepared profile-local database');
  }

  const generation = instance.syncGeneration;
  const assertSyncCurrent = () => {
    requireOpenInstance(instance);
    if (instance.syncGeneration !== generation)
      throw new Error('PowerSync connection was cancelled');
  };
  return runSyncOperation(instance, async () => {
    await instance.disconnecting;
    assertSyncCurrent();
    if (instance.syncConnected) return instance.db;
    await purgeNonSyncableLocalCrud(instance.db);
    await purgePreHydrationBootstrapCrud(instance.db);
    assertSyncCurrent();
    const controller = new AbortController();
    instance.syncController = controller;
    await instance.db.connect(new DesktopPowerSyncConnector(credentialProvider, controller.signal));
    assertSyncCurrent();
    instance.syncConnected = true;
    console.log('[PowerSync] Promoted to sync mode');
    return instance.db;
  });
}

/** Disconnect cloud sync while keeping the active Profile database open locally. */
export async function disablePowerSyncSyncMode(): Promise<void> {
  const instance = powerSyncInstance;
  if (!instance || instance.phase !== 'open') return;
  await stopSync(instance);
  console.log('[PowerSync] Cloud sync disconnected; local Profile remains open');
}

async function stopSync(instance: ProfileDatabaseInstance): Promise<void> {
  instance.syncGeneration++;
  instance.syncController?.abort();
  instance.syncController = null;
  instance.syncConnected = false;
  const inFlight = instance.syncTail;
  if (!instance.disconnecting) {
    const disconnecting = instance.db.disconnect().finally(() => {
      if (instance.disconnecting === disconnecting) instance.disconnecting = null;
    });
    instance.disconnecting = disconnecting;
  }
  await Promise.all([instance.disconnecting, inFlight]);
}

/**
 * Gracefully shuts down the PowerSync database WITHOUT wiping local data.
 * Use on app quit to preserve the sync cache for the next cold start.
 */
export async function shutdownPowerSync(): Promise<void> {
  if (powerSyncInstance) await closeProfileDatabase(powerSyncInstance);
}

/**
 * Returns the active PowerSync database instance, or null if not connected.
 */
export function getPowerSyncDatabase(): PowerSyncDatabase | null {
  return powerSyncInstance?.phase === 'open' ? powerSyncInstance.db : null;
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
    const dispose = onChangeDispose;
    onChangeDispose = null;
    dispose();
    console.log('[PowerSync] Change broadcast stopped');
  }
}
