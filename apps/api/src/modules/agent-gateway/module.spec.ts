import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { request as httpRequest } from 'node:http';
import { composeAgentGatewayModule } from './module';
import { createRequestContextMiddleware } from '../../shared/infrastructure/http/middlewares/request-context.middleware';

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
async function fixture(oauthEnabled = false) {
  const app = express();
  app.use(createRequestContextMiddleware());
  app.use(express.json({ limit: '256kb' }));
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('address');
  const base = `http://127.0.0.1:${address.port}`;
  const pats = {
    create: vi.fn().mockResolvedValue({ secret: 'one-time' }),
    list: vi.fn().mockResolvedValue([]),
    revoke: vi.fn().mockResolvedValue(true),
    authenticate: vi.fn().mockResolvedValue(null),
    consumeReadQuota: vi.fn().mockResolvedValue(true),
  };
  const audit = vi.fn();
  const oauth = {
    list: vi.fn().mockResolvedValue([]),
    revoke: vi.fn().mockResolvedValue(undefined),
    authenticate: vi.fn().mockResolvedValue(null),
    consumeReadQuota: vi.fn().mockResolvedValue(true),
  };
  const module = composeAgentGatewayModule({
    admission: {
      start: async () => {},
      destroy: async () => {},
      consumeIp: async () => true,
      consumeOwner: async () => true,
    },
    enabled: true,
    audience: `${base}/mcp`,
    cursorSecret: 'test-only-secret-'.repeat(3),
    trustedOrigins: ['https://memo.test'],
    pats,
    oauth: oauthEnabled ? oauth : undefined,
    goals: { getGoal: vi.fn(), searchGoalPage: vi.fn() },
    audit,
  });
  const router = express.Router();
  await module.register({
    app,
    router,
    middleware: {
      auth: (req, res, next) => {
        if (req.headers.authorization !== 'Bearer firstparty') {
          res.sendStatus(401);
          return;
        }
        Object.assign(req, { user: { identityId: 'owner-a', emailVerified: true } });
        next();
      },
      requireEmailVerified: (_req, _res, next) => next(),
      requireRole: () => (_req, _res, next) => next(),
    },
  } as never);
  app.use('/api/v1', router);
  return { base, pats, oauth, audit };
}
describe('Gateway API host admission', () => {
  it('requires a first-party session, trusted Origin and strict input to mint a PAT', async () => {
    const f = await fixture();
    const url = `${f.base}/api/v1/agent-connections/pats`;
    const create = (authorization: string, origin?: string, body = { name: 'read pilot' }) =>
      fetch(url, {
        method: 'POST',
        headers: {
          authorization,
          'content-type': 'application/json',
          ...(origin ? { origin } : {}),
        },
        body: JSON.stringify(body),
      });
    expect((await create('Bearer pat', 'https://memo.test')).status).toBe(401);
    expect((await create('Bearer firstparty')).status).toBe(403);
    expect((await create('Bearer firstparty', 'https://evil.test')).status).toBe(403);
    expect(
      (
        await create('Bearer firstparty', 'https://memo.test', {
          name: 'read pilot',
          identityId: 'owner-b',
        } as never)
      ).status,
    ).toBe(400);
    expect(f.pats.create).not.toHaveBeenCalled();
    const created = await create('Bearer firstparty', 'https://memo.test');
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');
    expect(f.pats.create).toHaveBeenCalledWith(
      'owner-a',
      { name: 'read pilot', expiresInDays: 7, scopes: ['goals:read'] },
      expect.objectContaining({ source: 'http' }),
    );
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'pat_create', outcome: 'OK', identityId: 'owner-a' }),
    );
  });
  it('mounts root /mcp with independent credential verification and host checks', async () => {
    const f = await fixture();
    const denied = await fetch(`${f.base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer firstparty' },
      body: '{}',
    });
    expect(denied.status).toBe(401);
    expect(denied.headers.get('x-request-id')).toBeTruthy();
    expect(f.pats.authenticate).not.toHaveBeenCalled();
    const badHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(
        `${f.base}/mcp`,
        { method: 'POST', headers: { host: 'evil.test', 'content-type': 'application/json' } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end('{}');
    });
    expect(badHost).toBe(403);
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'HOST_DENIED',
        scopeDecision: 'denied',
        requestId: expect.any(String),
      }),
    );
  });
  it('protects OAuth management with the first-party lane and audits its credential type', async () => {
    const f = await fixture(true);
    const id = '00000000-0000-4000-8000-000000000001';
    const url = `${f.base}/api/v1/agent-connections/oauth/${id}`;
    expect(
      (
        await fetch(url, {
          method: 'DELETE',
          headers: { authorization: 'Bearer oauth', origin: 'https://memo.test' },
        })
      ).status,
    ).toBe(401);
    expect(
      (await fetch(url, { method: 'DELETE', headers: { authorization: 'Bearer firstparty' } }))
        .status,
    ).toBe(403);
    expect(f.oauth.revoke).not.toHaveBeenCalled();
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { authorization: 'Bearer firstparty', origin: 'https://memo.test' },
    });
    expect(response.status).toBe(204);
    expect(f.oauth.revoke).toHaveBeenCalledWith('owner-a', id);
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'oauth_revoke',
        credentialId: id,
        identityId: 'owner-a',
        outcome: 'OK',
      }),
    );
    const challenge = await fetch(`${f.base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(challenge.status).toBe(401);
    expect(challenge.headers.get('www-authenticate')).toContain(
      '/.well-known/oauth-protected-resource/mcp',
    );
  });
});
