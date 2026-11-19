import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { prisma } from '@memoflow/database';
import { IdentityId } from '@memoflow/utils/domain';
import { createAccountPrismaActiveQuery } from '@memoflow/account';
import { createScopedPatService } from '@memoflow/cloud-auth/server';
import {
  DEFAULT_EXTERNAL_AGENT_RATE_LIMITS,
  type GatewayToolCheckpoint,
} from '@memoflow/agent-gateway';
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

  it('enforces the configured budget for parallel calls from independent service instances', async () => {
    const owner = IdentityId.generate();
    await seedAccount({ id: owner });
    const issued = await service().create(String(owner), { name: 'quota fixture' });
    const limited = () =>
      createScopedPatService({ database: prisma, audience, accountIsActive, readQuotaPerMinute: 12 });
    const results = await Promise.all(
      Array.from({ length: 20 }, () => limited().consumeReadQuota(issued.id)),
    );
    expect(results.filter(Boolean)).toHaveLength(12);
    expect(
      (await prisma.externalAgentPat.findUniqueOrThrow({ where: { id: issued.id } })).rateCount,
    ).toBe(12);
  });

  it('falls back to the calibrated default when no budget is configured', async () => {
    const owner = IdentityId.generate();
    await seedAccount({ id: owner });
    const issued = await service().create(String(owner), { name: 'default quota fixture' });
    const perMinute = DEFAULT_EXTERNAL_AGENT_RATE_LIMITS.credentialPerMinute;
    await prisma.externalAgentPat.update({
      where: { id: issued.id },
      data: { rateCount: perMinute - 1, rateWindow: new Date() },
    });
    expect(await service().consumeReadQuota(issued.id)).toBe(true);
    expect(await service().consumeReadQuota(issued.id)).toBe(false);
  });
});
