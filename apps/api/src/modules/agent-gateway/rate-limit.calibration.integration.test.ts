import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import Redis from 'ioredis';
import {
  DEFAULT_EXTERNAL_AGENT_RATE_LIMITS,
  type GatewayToolCheckpoint,
} from '@memoflow/agent-gateway';
import { createScopedPatService } from '@memoflow/cloud-auth/server';
import { createAccountPrismaActiveQuery } from '@memoflow/account';
import { prisma } from '@memoflow/database';
import { IdentityId } from '@memoflow/utils/domain';
import {
  cleanAll,
  disconnectPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { composeAgentGatewayModule } from './module';
import { createPilotAdmission } from './pilot-admission';
import { createRequestContextMiddleware } from '../../shared/infrastructure/http/middlewares/request-context.middleware';

/**
 * Reproducible admission calibration for `/mcp`.
 *
 * Sends a controlled-rate HTTP stream at the real host route backed by the real
 * Redis IP/owner buckets and the real PostgreSQL credential window, then reports
 * the observed first rejection per dimension next to the configured budget.
 * Each dimension is isolated: credential runs one identity from one address,
 * owner rotates credentials behind a distinct address per request, and IP
 * rotates owners and credentials behind one address. It never targets a
 * deployed environment.
 *
 * Run with:
 *   EAG_RATE_LIMIT_CALIBRATION=1 pnpm exec vitest run \
 *     --config apps/api/vitest.integration.config.ts \
 *     apps/api/src/modules/agent-gateway/rate-limit.calibration.integration.test.ts
 *
 * Optional: EAG_TEST_REDIS_URL=redis://127.0.0.1:6379 reuses a Redis instead of
 * starting the pinned container.
 */
const enabled = process.env.EAG_RATE_LIMIT_CALIBRATION === '1';
const only = process.env.EAG_RATE_LIMIT_CALIBRATION_DIMENSION;
const wants = (dimension: 'credential' | 'owner' | 'ip') => !only || only === dimension;
const perSecond = 40;
const windowRiskMs = 45_000;
const { ipPerMinute, ownerPerMinute, credentialPerMinute } = DEFAULT_EXTERNAL_AGENT_RATE_LIMITS;

type Reply = { readonly status: number; readonly error: string | null; readonly retryAfter: string | null };
type Outcome = Reply & { readonly atMs: number };

type Scenario = {
  readonly name: string;
  readonly budget: number;
  readonly requests: number;
  readonly address: (index: number) => string;
  readonly token: (index: number) => string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const bucket = (kind: 'ip' | 'owner', value: string) =>
  `eag:read-pilot:${kind}:${createHash('sha256').update(value).digest('hex')}`;

/** Dispatch at a fixed cadence; latency below the cadence does not distort the rate. */
async function drive(
  count: number,
  send: (index: number) => Promise<Reply>,
): Promise<Outcome[]> {
  const outcomes: Outcome[] = new Array(count);
  const startedAt = performance.now();
  const interval = 1000 / perSecond;
  let inFlight = 0;
  for (let index = 0; index < count; index++) {
    const due = startedAt + index * interval;
    const wait = due - performance.now();
    if (wait > 0) await sleep(wait);
    while (inFlight >= 64) await sleep(1);
    inFlight++;
    void send(index)
      .catch(
        (cause: unknown): Reply => ({
          status: 0,
          error: cause instanceof Error ? cause.name : 'TRANSPORT',
          retryAfter: null,
        }),
      )
      .then((reply) => {
        outcomes[index] = { ...reply, atMs: performance.now() - startedAt };
      })
      .finally(() => {
        inFlight--;
      });
  }
  while (inFlight > 0) await sleep(5);
  return outcomes;
}

function summarize(name: string, budget: number, outcomes: Outcome[]) {
  const firstDenied = outcomes.findIndex((outcome) => outcome.status === 429);
  const denied = outcomes.filter((outcome) => outcome.status === 429);
  const other = outcomes.filter((outcome) => outcome.status !== 200 && outcome.status !== 429);
  const report = {
    dimension: name,
    configuredPerMinute: budget,
    requests: outcomes.length,
    allowed: outcomes.length - denied.length,
    firstRejectedRequest: firstDenied === -1 ? 'none' : firstDenied + 1,
    firstRejectionAtMs: firstDenied === -1 ? null : Math.round(outcomes[firstDenied].atMs),
    status: firstDenied === -1 ? 'never' : String(denied[0].status),
    error: firstDenied === -1 ? null : denied[0].error,
    retryAfter: firstDenied === -1 ? null : denied[0].retryAfter,
    otherStatuses: [...new Set(other.map((outcome) => outcome.status))].join(',') || 'none',
    elapsedMs: Math.round(outcomes.at(-1)?.atMs ?? 0),
  };
  console.log(`[rate-limit-calibration] ${JSON.stringify(report)}`);
  expect(report.allowed, `${name}: allowed requests`).toBe(budget);
  expect(report.firstRejectedRequest, `${name}: first rejection`).toBe(budget + 1);
  expect(report.status).toBe('429');
  expect(report.error).toBe('RATE_LIMITED');
  expect(report.retryAfter).toBe('60');
  expect(report.otherStatuses, `${name}: accepted requests`).toBe('none');
  expect(report.elapsedMs, `${name}: window risk`).toBeLessThan(windowRiskMs);
  return report;
}

describe.skipIf(!enabled)('hosted MCP admission calibration', () => {
  let url = process.env.EAG_TEST_REDIS_URL;
  let container: string | undefined;
  let server: Server;
  let admission: ReturnType<typeof createPilotAdmission>;
  let pats: ReturnType<typeof createScopedPatService>;
  let redis: Redis;
  let audience: string;

  beforeAll(async () => {
    if (!url) {
      container = execFileSync(
        'docker',
        ['run', '--detach', '--rm', '--publish', '127.0.0.1::6379', 'redis:8.10.2-alpine'],
        { encoding: 'utf8', timeout: 20000 },
      ).trim();
      const address = execFileSync('docker', ['port', container, '6379/tcp'], {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      url = `redis://${address}`;
      execFileSync('docker', ['exec', container, 'redis-cli', 'ping'], {
        encoding: 'utf8',
        timeout: 5000,
      });
    }
    redis = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    await redis.connect();
    admission = createPilotAdmission(redis.duplicate());
    await admission.start();

    const app = express();
    // The calibration client supplies its own source address per scenario.
    app.set('trust proxy', 1);
    app.use(createRequestContextMiddleware({ observer: { complete() {} } }));
    app.use(express.json({ limit: '256kb' }));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Unusable calibration listener');
    audience = `http://127.0.0.1:${address.port}/mcp`;
    pats = createScopedPatService({
      database: prisma,
      audience,
      accountIsActive: createAccountPrismaActiveQuery(prisma),
    });
    const gateway = composeAgentGatewayModule({
      admission,
      enabled: true,
      toolCheckpoint: (async (_principal, _tool, work) => work()) satisfies GatewayToolCheckpoint,
      audience,
      cursorSecret: 'test-only-secret-'.repeat(3),
      trustedOrigins: [],
      pats,
      goals: {
        getGoal: async () => null,
        searchGoalPage: async () => ({ items: [], hasMore: false, next: null }),
      },
      audit: () => {},
    });
    await gateway.register({
      app,
      router: express.Router(),
      middleware: {
        auth: (_req, res) => res.sendStatus(401),
        requireEmailVerified: (_req, res) => res.sendStatus(403),
        requireRole: () => (_req, res) => res.sendStatus(403),
      },
    } as never);
  });

  beforeEach(cleanAll);

  afterAll(async () => {
    server?.closeAllConnections();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    await admission?.destroy();
    await redis?.quit();
    if (container) execFileSync('docker', ['stop', container], { stdio: 'ignore', timeout: 5000 });
    await cleanAll();
    await disconnectPrisma();
  });

  async function credential(identityId: string, name: string) {
    return (await pats.create(identityId, { name, scopes: ['goals:read'] })).secret;
  }

  async function run(scenario: Scenario) {
    const outcomes = await drive(scenario.requests, async (index) => {
      const response = await fetch(audience, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2026-07-28',
          'Mcp-Method': 'tools/list',
          authorization: `Bearer ${scenario.token(index)}`,
          'x-forwarded-for': scenario.address(index),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: index,
          method: 'tools/list',
          params: {
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientInfo': {
                name: 'rate-limit-calibration',
                version: '1',
              },
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      });
      const text = await response.text();
      if (index === 0)
        console.log('[rate-limit-probe]', response.status, response.headers.get('content-type'), text.slice(0, 160));
      let error: string | null = null;
      try {
        error = (JSON.parse(text) as { error?: string }).error ?? null;
      } catch {
        error = null;
      }
      return { status: response.status, error, retryAfter: response.headers.get('retry-after') };
    });
    return summarize(scenario.name, scenario.budget, outcomes);
  }

  it('measures the credential, owner and IP trigger points at the configured budgets', async () => {
    const reports = [];
    if (wants('credential')) {
      const identity = String(IdentityId.generate());
      await seedAccount({ id: identity });
      const secret = await credential(identity, 'credential dimension');
      reports.push(
        await run({
          name: 'credential',
          budget: credentialPerMinute,
          requests: credentialPerMinute + 20,
          address: () => '198.51.100.10',
          token: () => secret,
        }),
      );
      // Isolation: this budget binds before the owner and IP budgets.
      expect(Number(await redis.get(bucket('owner', identity)))).toBeLessThan(ownerPerMinute);
      expect(Number(await redis.get(bucket('ip', '198.51.100.10')))).toBeLessThan(ipPerMinute);
    }
    if (wants('owner')) {
      const identity = String(IdentityId.generate());
      await seedAccount({ id: identity });
      const secrets = await Promise.all(
        ['owner a', 'owner b', 'owner c'].map((name) => credential(identity, name)),
      );
      reports.push(
        await run({
          name: 'owner',
          budget: ownerPerMinute,
          requests: ownerPerMinute + 20,
          address: (index) => `203.0.113.${(index % 200) + 1}`,
          token: (index) => secrets[index % secrets.length],
        }),
      );
      const counts = await prisma.externalAgentPat.findMany({
        where: { userId: identity },
        select: { rateCount: true },
      });
      expect(counts.every(({ rateCount }) => rateCount < credentialPerMinute)).toBe(true);
    }
    if (wants('ip')) {
      const owners = Array.from({ length: 3 }, () => String(IdentityId.generate()));
      await Promise.all(owners.map((identity) => seedAccount({ id: identity })));
      const secrets = await Promise.all(
        owners.flatMap((identity, ownerIndex) =>
          ['ip a', 'ip b'].map((name) => credential(identity, `${name} ${ownerIndex}`)),
        ),
      );
      reports.push(
        await run({
          name: 'ip',
          budget: ipPerMinute,
          requests: ipPerMinute + 20,
          address: () => '192.0.2.20',
          token: (index) => secrets[index % secrets.length],
        }),
      );
      const ownerCounts = await Promise.all(
        owners.map((identity) => redis.get(bucket('owner', identity))),
      );
      expect(ownerCounts.map(Number).every((count) => count < ownerPerMinute)).toBe(true);
      const counts = await prisma.externalAgentPat.findMany({
        where: { userId: { in: owners } },
        select: { rateCount: true },
      });
      expect(counts.every(({ rateCount }) => rateCount < credentialPerMinute)).toBe(true);
    }
    console.table(reports);
  }, 120_000);
});
