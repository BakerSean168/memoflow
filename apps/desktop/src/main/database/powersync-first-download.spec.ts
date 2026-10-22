import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PowerSyncDatabase } from '@powersync/node';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closePowerSyncHttpTransport, powerSyncHttpFetch } from './powersync-http-transport';

const OWNER = 'identity-synthetic-qa';
const ROUTINE_COUNT = 4;
const INVOCATION_COUNT = 5;

function fixtureOperations() {
  const operations: Array<{
    op_id: string;
    op: 'PUT';
    object_type: string;
    object_id: string;
    data: string;
    checksum: number;
  }> = [];

  for (let i = 0; i < ROUTINE_COUNT; i++) {
    operations.push({
      op_id: String(i + 1),
      op: 'PUT',
      object_type: 'routine_definitions',
      object_id: `routine-qa-${i}`,
      data: JSON.stringify({
        identity_id: OWNER,
        name: `Routine QA ${i}`,
        enabled: 1,
        version: 1,
      }),
      checksum: 0,
    });
  }
  for (let i = 0; i < INVOCATION_COUNT; i++) {
    operations.push({
      op_id: String(ROUTINE_COUNT + i + 1),
      op: 'PUT',
      object_type: 'scheduled_invocations',
      object_id: `invocation-qa-${i}`,
      data: JSON.stringify({
        identity_id: OWNER,
        owner_type: 'routine',
        owner_id: `routine-qa-${i % ROUTINE_COUNT}`,
        status: 'pending',
        run_at: '2026-10-22T23:50:00.000Z',
      }),
      checksum: 0,
    });
  }
  return operations;
}

/**
 * Regression for #567 / #585:
 * The real Node SDK must read a complete NDJSON checkpoint through the same
 * Undici fetch used by the Desktop, apply business rows to SQLite and persist
 * its checkpoint over a cold restart. No Electron Profile, credentials, or
 * external PowerSync endpoint are used.
 *
 * This test complements (but does not replace) original Windows Profile
 * production-download acceptance.
 */
describe('Desktop PowerSync first-download checkpoint (real SDK)', () => {
  let server: Server | null = null;
  let database: InstanceType<typeof PowerSyncDatabase> | null = null;
  let root: string | null = null;

  afterEach(async () => {
    await database?.disconnect().catch(() => undefined);
    await database?.close().catch(() => undefined);
    database = null;
    await closePowerSyncHttpTransport();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
      root = null;
    }
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('hydrates routines and invocations and retains the checkpoint on restart', async () => {
    const operations = fixtureOperations();
    const lastOp = String(operations.length);
    let streamRequests = 0;
    server = createServer(async (request, response) => {
      if (request.method !== 'POST' || request.url !== '/sync/stream') {
        response.writeHead(404);
        response.end();
        return;
      }
      streamRequests++;
      for await (const _chunk of request) {
        // Consume request body; no credentials or user data are recorded.
      }
      response.writeHead(200, { 'content-type': 'application/x-ndjson' });
      response.write(
        JSON.stringify({
          checkpoint: {
            last_op_id: lastOp,
            buckets: [
              { bucket: 'user_data[1]', checksum: 0, count: operations.length, priority: 3 },
            ],
          },
        }) + '\n',
      );
      response.write(
        JSON.stringify({
          data: {
            bucket: 'user_data[1]',
            data: operations,
            after: '0',
            next_after: lastOp,
            has_more: false,
          },
        }) + '\n',
      );
      response.write(JSON.stringify({ checkpoint_complete: { last_op_id: lastOp } }) + '\n');
      // Keep the stream alive; SDK disconnect will terminate the request.
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;

    root = await fs.mkdtemp(path.join(os.tmpdir(), 'powersync-first-download-'));
    const dbFile = path.join(root, 'qa.sqlite');
    const createDatabase = () =>
      new PowerSyncDatabase({
        schema: PowerSyncAppSchema,
        remoteOptions: { customFetch: powerSyncHttpFetch },
        database: { dbFilename: dbFile, readWorkerCount: 1 },
      });

    vi.stubEnv('NO_PROXY', '127.0.0.1,localhost');
    // PowerSync SDK must not use Node/Electron's native fetch paired with
    // a dispatcher from an incompatible undici installation (#585).
    const nativeFetch = vi.fn(() => Promise.reject(new TypeError('invalid onRequestStart method')));
    vi.stubGlobal('fetch', nativeFetch);

    database = createDatabase();
    await database.waitForReady();
    expect(await database.getAll('SELECT id FROM routine_definitions')).toEqual([]);

    await database.connect({
      fetchCredentials: async () => ({
        endpoint: `http://127.0.0.1:${port}`,
        token: 'synthetic-qa-token-only',
        expiresAt: new Date(Date.now() + 60_000),
      }),
      uploadData: async () => undefined,
    });

    await vi.waitFor(() => expect(database?.currentStatus.hasSynced).toBe(true), {
      timeout: 10_000,
      interval: 100,
    });
    expect(streamRequests).toBeGreaterThan(0);
    expect(nativeFetch).not.toHaveBeenCalled();

    const routines = await database.getAll<{ id: string; name: string }>(
      'SELECT id, name FROM routine_definitions ORDER BY id',
    );
    const invocations = await database.getAll<{ id: string; status: string }>(
      'SELECT id, status FROM scheduled_invocations ORDER BY id',
    );
    expect(routines).toHaveLength(ROUTINE_COUNT);
    expect(routines[0]).toMatchObject({ id: 'routine-qa-0', name: 'Routine QA 0' });
    expect(invocations).toHaveLength(INVOCATION_COUNT);
    expect(invocations[0]).toMatchObject({ id: 'invocation-qa-0', status: 'pending' });
    expect(await database.getAll('SELECT * FROM ps_buckets')).toHaveLength(1);
    expect(await database.getAll('SELECT * FROM ps_sync_state')).toHaveLength(1);
    expect(await database.getAll('SELECT * FROM ps_crud')).toHaveLength(0);

    await database.disconnect();
    await database.close();
    database = createDatabase();
    await database.waitForReady();

    expect(await database.getAll('SELECT id FROM routine_definitions')).toHaveLength(ROUTINE_COUNT);
    expect(await database.getAll('SELECT id FROM scheduled_invocations')).toHaveLength(
      INVOCATION_COUNT,
    );
    expect(await database.getAll('SELECT * FROM ps_buckets')).toHaveLength(1);
    expect(await database.getAll('SELECT * FROM ps_sync_state')).toHaveLength(1);
  }, 20_000);
});
