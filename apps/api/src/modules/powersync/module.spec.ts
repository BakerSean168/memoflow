import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express, { Router } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseClient, IApiModuleContext } from '../../shared/contracts/api-module.js';
import { env } from '../../shared/infrastructure/config/env.js';
import { composePowerSyncApiModule } from './module.js';
import { computeProfileSnapshotKey } from './snapshot-storage.js';
import { PowerSyncPreferenceConflictError } from './user-preference-crud-executor.js';

const TEST_IDENTITY_ID = '7e92ca52-b331-4cbb-9ecc-2b1f1471c370';

function binaryParser(
  res: NodeJS.ReadableStream & {
    data?: Buffer[];
    setEncoding: (encoding: string) => void;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
  },
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', (error) => callback(error as Error, Buffer.alloc(0)));
}

function createSqliteBuffer(): Buffer {
  return Buffer.concat([Buffer.from('SQLite format 3\u0000', 'utf8'), Buffer.alloc(512)]);
}

async function createTestApp(database?: DatabaseClient): Promise<ReturnType<typeof express>> {
  const app = express();
  app.use(express.json());

  const router = Router();
  app.use('/api/v1', router);
  const db =
    database ??
    ({
      $transaction: async (callback: (tx: Record<string, never>) => Promise<void>) =>
        await callback({}),
    } as unknown as DatabaseClient);

  const context: IApiModuleContext = {
    app,
    router,
    middleware: {
      auth: (req, _res, next) => {
        const authenticated = req as typeof req & {
          user?: { identityId: string };
        };
        authenticated.user = { identityId: TEST_IDENTITY_ID };
        next();
      },
      requireRole: () => (_req, _res, next) => next(),
    },
  };

  // DB/config are bound by the factory closure; register receives the
  // transport-only context (no db).
  const module = composePowerSyncApiModule({ db });
  module.register(context);
  return app;
}

describe('PowerSyncApiModule profile snapshot routes', () => {
  let snapshotRootDir: string;
  let previousSnapshotDir: string | undefined;

  beforeEach(async () => {
    snapshotRootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'powersync-snapshot-api-'));
    previousSnapshotDir = env.POWERSYNC_SNAPSHOT_DIR;
    env.POWERSYNC_SNAPSHOT_DIR = snapshotRootDir;
  });

  afterEach(async () => {
    env.POWERSYNC_SNAPSHOT_DIR = previousSnapshotDir;
    await fs.promises.rm(snapshotRootDir, { recursive: true, force: true });
  });

  it('returns a machine-readable 409 without acknowledging a different canonical ID', async () => {
    const db = {
      $transaction: async () => {
        throw new PowerSyncPreferenceConflictError(
          'presentation',
          0,
          {
            namespace: 'presentation',
            revision: 1,
            preferences: { theme: 'dark', language: 'zh-CN' },
          },
          'canonical',
          'canonical_id_mismatch',
        );
      },
    } as unknown as DatabaseClient;
    const app = await createTestApp(db);
    const response = await request(app)
      .put('/api/v1/powersync/crud')
      .send({
        transactions: [{ ops: [] }],
      });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        context: {
          code: 'preference_revision_conflict',
          reason: 'canonical_id_mismatch',
          identityId: TEST_IDENTITY_ID,
          canonicalId: 'canonical',
          namespace: 'presentation',
          expectedRevision: 0,
          latest: { revision: 1, preferences: { theme: 'dark', language: 'zh-CN' } },
        },
      },
    });
  });

  it('returns available=false when no snapshot exists for the current identity', async () => {
    const app = await createTestApp();
    const response = await request(app).get('/api/v1/powersync/profile-snapshot');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.data).toEqual({
      available: false,
      version: null,
      downloadUrl: null,
      checksumSha256: null,
      generatedAt: null,
    });
  });

  it('returns manifest metadata and streams the sqlite snapshot for the current identity', async () => {
    const snapshotKey = computeProfileSnapshotKey(TEST_IDENTITY_ID);
    const snapshotDir = path.join(snapshotRootDir, snapshotKey);
    const sqliteBuffer = createSqliteBuffer();
    const checksumSha256 = await import('node:crypto').then(({ createHash }) =>
      createHash('sha256').update(sqliteBuffer).digest('hex'),
    );

    await fs.promises.mkdir(snapshotDir, { recursive: true });
    await fs.promises.writeFile(path.join(snapshotDir, 'powersync.sqlite'), sqliteBuffer);
    await fs.promises.writeFile(
      path.join(snapshotDir, 'manifest.json'),
      JSON.stringify(
        {
          version: '2026-05-18T00:00:00Z',
          checksumSha256,
          generatedAt: '2026-05-18T00:00:00Z',
        },
        null,
        2,
      ),
      'utf8',
    );

    const app = await createTestApp();
    const manifestResponse = await request(app).get('/api/v1/powersync/profile-snapshot');

    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.body.data).toEqual({
      available: true,
      version: '2026-05-18T00:00:00Z',
      checksumSha256,
      generatedAt: '2026-05-18T00:00:00Z',
      downloadUrl: `/api/v1/powersync/profile-snapshot/download/${snapshotKey}/${encodeURIComponent('2026-05-18T00:00:00Z')}`,
    });

    const downloadResponse = await request(app)
      .get(manifestResponse.body.data.downloadUrl)
      .buffer(true)
      .parse(binaryParser);
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers['x-powersync-snapshot-version']).toBe('2026-05-18T00:00:00Z');
    expect(Buffer.compare(downloadResponse.body as Buffer, sqliteBuffer)).toBe(0);
  });
});

describe('PowerSyncApiModule schema route (residual 629)', () => {
  it('returns HttpResponse ok envelope for GET /powersync/schema', async () => {
    const app = await createTestApp();
    const res = await request(app).get('/api/v1/powersync/schema');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.code).toBe(200);
    expect(res.body.data).toEqual({
      powersync_url: expect.any(String),
      configured: expect.any(Boolean),
    });
    expect(typeof res.body.timestamp).toBe('number');
    expect(res.body).not.toHaveProperty('success');
  });
});
