import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { prisma } from '@memoflow/database';
import { IdentityId } from '@memoflow/utils/domain';
import { createAccountPrismaActiveQuery } from '@memoflow/account';
import { createScopedPatService } from '@memoflow/cloud-auth/server';
import type { GatewayToolCheckpoint } from '@memoflow/agent-gateway';
import {
  cleanAll,
  disconnectPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { composeAgentGatewayModule } from '../../modules/agent-gateway/module';
import { createRequestContextMiddleware } from '../../shared/infrastructure/http/middlewares/request-context.middleware';

const accountIsActive = createAccountPrismaActiveQuery(prisma);
const audience = 'https://api.memo.test/mcp';
const service = () => createScopedPatService({ database: prisma, audience, accountIsActive });

/** Mount the real management route over the real PAT service and PostgreSQL. */
async function mountPatApi(
  identityId: string,
): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(createRequestContextMiddleware({ observer: { complete() {} } }));
  app.use(express.json({ limit: '256kb' }));
  const server: Server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('address');
  const origin = `http://127.0.0.1:${address.port}`;
  const module = composeAgentGatewayModule({
    admission: {
      start: async () => {},
      destroy: async () => {},
      consumeIp: async () => true,
      consumeOwner: async () => true,
    },
    enabled: true,
    toolCheckpoint: (async (_principal, _tool, work) => work()) satisfies GatewayToolCheckpoint,
    audience: `${origin}/mcp`,
    cursorSecret: 'test-only-secret-'.repeat(3),
    trustedOrigins: ['https://memo.test'],
    pats: createScopedPatService({ database: prisma, audience: `${origin}/mcp`, accountIsActive }),
    goals: { getGoal: vi.fn(), searchGoalPage: vi.fn() },
    audit: () => {},
    auditQuery: { list: async () => ({ items: [], hasMore: false }) },
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
        Object.assign(req, { user: { identityId, emailVerified: true } });
        next();
      },
      requireEmailVerified: (_req, _res, next) => next(),
      requireRole: () => (_req, _res, next) => next(),
    },
  } as never);
  app.use('/api/v1', router);
  return {
    url: `${origin}/api/v1/agent-connections/pats`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe('scoped PAT durable authority', () => {
  beforeEach(async () => {
    await cleanAll();
  });
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  it('stores only a digest and rechecks audience, revocation and account state', async () => {
    const owner = IdentityId.generate();
    const other = IdentityId.generate();
    await seedAccount({ id: owner });
    await seedAccount({ id: other });
    const issued = await service().create(String(owner), { name: 'private read pilot' });
    const row = await prisma.externalAgentPat.findUniqueOrThrow({ where: { id: issued.id } });
    expect(row.tokenDigest).toBe(createHash('sha256').update(issued.secret).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(issued.secret);
    expect(await service().list(String(other))).toEqual([]);
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toMatchObject({
      identityId: String(owner),
      credentialId: issued.id,
      scopes: ['goals:read'],
    });
    expect(
      await createScopedPatService({
        database: prisma,
        audience: 'https://other.memo.test/mcp',
        accountIsActive,
      }).authenticate(`Bearer ${issued.secret}`),
    ).toBeNull();
    expect(await service().revoke(String(other), issued.id)).toBe(false);
    const closure = await prisma.accountClosureOperation.create({
      data: {
        identityId: String(owner),
        idempotencyKey: 'pat-closure-fixture',
        phase: 'requested',
        status: 'Pending',
      },
    });
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toBeNull();
    await prisma.accountClosureOperation.delete({ where: { id: closure.id } });

    await prisma.cloudAuthUser.update({
      where: { id: String(owner) },
      data: { disabledAt: new Date() },
    });
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toBeNull();
    await prisma.cloudAuthUser.update({ where: { id: String(owner) }, data: { disabledAt: null } });
    await prisma.account.update({ where: { id: String(owner) }, data: { status: 'Closed' } });
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toBeNull();
    await prisma.account.update({ where: { id: String(owner) }, data: { status: 'Active' } });
    // #490 widened the PAT allowlist to the gateway write scopes; they authenticate as granted.
    await prisma.externalAgentPat.update({
      where: { id: issued.id },
      data: { scopes: ['goals:write', 'routines:write'] },
    });
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toMatchObject({
      identityId: String(owner),
      credentialId: issued.id,
      scopes: ['goals:write', 'routines:write'],
    });
    // A scope outside the allowlist, or a duplicated scope, still fails closed.
    await prisma.externalAgentPat.update({
      where: { id: issued.id },
      data: { scopes: ['goals:admin'] },
    });
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toBeNull();
    await prisma.externalAgentPat.update({
      where: { id: issued.id },
      data: { scopes: ['goals:read', 'goals:read'] },
    });
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toBeNull();
    await prisma.externalAgentPat.update({
      where: { id: issued.id },
      data: { scopes: ['goals:read'], expiresAt: new Date(0) },
    });
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toBeNull();
    await prisma.externalAgentPat.update({
      where: { id: issued.id },
      data: { expiresAt: issued.expiresAt },
    });
    expect(await service().revoke(String(owner), issued.id)).toBe(true);
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toBeNull();
  });

  it('replays one PAT per idempotency key and creates distinct tokens for distinct keys', async () => {
    const owner = IdentityId.generate();
    await seedAccount({ id: owner });
    const api = await mountPatApi(String(owner));
    const post = (body: Record<string, unknown>) =>
      fetch(api.url, {
        method: 'POST',
        headers: {
          authorization: 'Bearer firstparty',
          origin: 'https://memo.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    const request = {
      name: 'new1',
      expiresInDays: 90,
      scopes: ['goals:read'],
      idempotencyKey: 'web-click-1',
    };
    try {
      const first = await post(request);
      expect(first.status).toBe(201);
      const firstBody = (await first.json()) as {
        data: { id: string; replayed: boolean; secret?: string };
      };
      expect(firstBody.data.replayed).toBe(false);
      expect(firstBody.data.secret).toMatch(/^mfp_/);

      // The client may resend the same submission after a slow/lost response.
      const replay = await post(request);
      expect(replay.status).toBe(201);
      const replayBody = (await replay.json()) as {
        data: { id: string; replayed: boolean; secret?: string };
      };
      expect(replayBody.data.id).toBe(firstBody.data.id);
      expect(replayBody.data.replayed).toBe(true);
      expect(replayBody.data.secret).toBeUndefined();
      expect(await prisma.externalAgentPat.count({ where: { userId: String(owner) } })).toBe(1);

      // A new submission intent (new key) must still create a second credential.
      const second = await post({ ...request, idempotencyKey: 'web-click-2' });
      expect(second.status).toBe(201);
      const secondBody = (await second.json()) as {
        data: { id: string; replayed: boolean; secret?: string };
      };
      expect(secondBody.data.id).not.toBe(firstBody.data.id);
      expect(secondBody.data.secret).toMatch(/^mfp_/);
      expect(await prisma.externalAgentPat.count({ where: { userId: String(owner) } })).toBe(2);

      // Same key, different input is a conflict and must not mint a third token.
      const conflict = await post({ ...request, name: 'renamed' });
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toEqual({ error: 'IDEMPOTENCY_CONFLICT' });
      expect(await prisma.externalAgentPat.count({ where: { userId: String(owner) } })).toBe(2);
    } finally {
      await api.close();
    }
  });

  it('enforces a shared quota for parallel calls from independent service instances', async () => {
    const owner = IdentityId.generate();
    await seedAccount({ id: owner });
    const issued = await service().create(String(owner), { name: 'quota fixture' });
    const results = await Promise.all(
      Array.from({ length: 70 }, () => service().consumeReadQuota(issued.id)),
    );
    expect(results.filter(Boolean)).toHaveLength(60);
    expect(
      (await prisma.externalAgentPat.findUniqueOrThrow({ where: { id: issued.id } })).rateCount,
    ).toBe(60);
  });

  it('reports the first MCP use on the management surface and throttles the rewrite (#1029)', async () => {
    const owner = IdentityId.generate();
    await seedAccount({ id: owner });
    const api = await mountPatApi(String(owner));
    const origin = new URL(api.url).origin;
    const firstParty = { authorization: 'Bearer firstparty', origin: 'https://memo.test' };
    const listPats = async () => {
      const response = await fetch(api.url, { headers: firstParty });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { id: string; lastUsedAt: string | null }[];
      };
      return body.data;
    };
    const callMcp = async (secret: string) => {
      const client = new Client(
        { name: 'last-used-fixture', version: '1' },
        { versionNegotiation: { mode: { pin: '2026-07-28' } } },
      );
      try {
        await client.connect(
          new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
            requestInit: { headers: { authorization: `Bearer ${secret}` } },
          }),
        );
        await client.listTools();
      } finally {
        await client.close();
      }
    };
    try {
      const created = await fetch(api.url, {
        method: 'POST',
        headers: { ...firstParty, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'usage probe',
          scopes: ['goals:read'],
          idempotencyKey: 'usage-probe-1',
        }),
      });
      expect(created.status).toBe(201);
      const { data: pat } = (await created.json()) as {
        data: { id: string; secret?: string; lastUsedAt: string | null };
      };
      if (!pat.secret) throw new Error('issuance did not return the one-time secret');
      expect(pat.lastUsedAt).toBeNull();
      // No MCP call yet: the management projection carries the never-used state.
      expect((await listPats())[0].lastUsedAt).toBeNull();

      await callMcp(pat.secret);
      const firstUse = (await listPats())[0].lastUsedAt;
      expect(firstUse).toEqual(expect.any(String));
      expect(Date.parse(String(firstUse))).toBeGreaterThan(Date.now() - 60_000);
      // The durable row is the authority the page projects.
      expect(
        (
          await prisma.externalAgentPat.findUniqueOrThrow({ where: { id: pat.id } })
        ).lastUsedAt?.toISOString(),
      ).toBe(firstUse);

      // A second verified call inside the throttle window must not move the timestamp.
      await callMcp(pat.secret);
      expect((await listPats())[0].lastUsedAt).toBe(firstUse);
    } finally {
      await api.close();
    }
  });
});
