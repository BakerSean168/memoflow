import express, { type RequestHandler } from 'express';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { expect, it, vi } from 'vitest';
import { createDataPortabilityModule } from '../server/infrastructure/data-portability.module';
import { registerDataPortabilityRoutes } from './routes';

it('authenticates preflight, commit and recovery and takes the principal only from middleware', async () => {
  const auth: RequestHandler = (req, res, next) => {
    if (req.headers.authorization !== 'Bearer valid') {
      res.sendStatus(401);
      return;
    }
    Object.assign(req, { user: { identityId: 'authenticated-account' } });
    next();
  };
  const plan = {
    schemaVersion: 1 as const,
    operationId: 'op',
    requestId: 'request-test',
    batchId: 'op',
    sourceDigest: 'a'.repeat(64),
    effectiveDigest: 'b'.repeat(64),
    blockers: [],
    preview: {
      batchId: 'op',
      dryRun: true,
      capabilities: [],
      created: {},
      updated: {},
      skipped: {},
      warnings: [],
    },
  };
  const committed = {
    status: 'committed' as const,
    plan,
    receipt: { ...plan.preview, dryRun: false },
    bindings: [],
    manifests: [],
    committedAt: '2026-10-09T00:00:00.000Z',
    serverVerified: true,
  };
  const api = {
    preflight: vi.fn(async () => plan),
    commit: vi.fn(async () => committed),
    get: vi.fn(async () => committed),
  };
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1/data-portability',
    registerDataPortabilityRoutes(
      createDataPortabilityModule({}).api,
      {
        exportServerHeldDataDisclosure: async () => {
          throw new Error('unused');
        },
      },
      { auth, requireRole: () => auth },
      null,
      api,
    ),
  );
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/data-portability/profile-import`;
  try {
    expect((await fetch(`${base}/request-test`)).status).toBe(401);
    const headers = { authorization: 'Bearer valid', 'content-type': 'application/json' };
    const input = { requestId: 'request-test', content: '{}' };
    expect(
      (await fetch(`${base}/preflight`, { method: 'POST', headers, body: JSON.stringify(input) }))
        .status,
    ).toBe(200);
    expect(api.preflight).toHaveBeenCalledWith('authenticated-account', input);
    expect(
      (
        await fetch(`${base}/commit`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...input, effectiveDigest: plan.effectiveDigest }),
        })
      ).status,
    ).toBe(200);
    expect(api.commit).toHaveBeenCalledWith('authenticated-account', {
      ...input,
      effectiveDigest: plan.effectiveDigest,
    });
    const recovered = await fetch(`${base}/request-test?identityId=other`, { headers });
    expect(recovered.status).toBe(200);
    expect(api.get).toHaveBeenCalledWith('authenticated-account', 'request-test');
    expect(
      (
        await fetch(`${base}/preflight`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...input, identityId: 'other' }),
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
    expect(api.preflight).toHaveBeenCalledTimes(1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
