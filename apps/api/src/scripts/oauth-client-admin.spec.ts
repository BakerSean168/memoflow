import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import {
  disableOAuthClient,
  enableOAuthClient,
  listOAuthClients,
  parseCommand,
  runOAuthClientAdmin,
  seedOAuthClient,
} from './oauth-client-admin';

interface ClientRow {
  clientId: string;
  name: string;
  redirectUris: string[];
  scopes: string[];
  disabled: boolean;
  clientDiscoveryId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  grantTypes: string[];
  responseTypes: string[];
  requirePKCE: boolean;
  tokenEndpointAuthMethod: string;
  skipConsent: boolean;
}

/** Minimal Prisma-shaped fake: only the delegates the admin commands touch. */
function memoryDb() {
  const clients = new Map<string, ClientRow>();
  const resources = new Map<string, { identifier: string }>();
  const links = new Map<string, { clientId: string; resourceId: string }>();

  const db = {
    oauthResource: {
      async findUnique(args: { where: { identifier: string } }) {
        return resources.get(args.where.identifier) ?? null;
      },
      async create(args: { data: { identifier: string } }) {
        const row = { identifier: args.data.identifier };
        resources.set(row.identifier, row);
        return row;
      },
    },
    oauthClient: {
      async findUnique(args: { where: { clientId: string } }) {
        return clients.get(args.where.clientId) ?? null;
      },
      async create(args: { data: ClientRow }) {
        if (clients.has(args.data.clientId))
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        const row = { ...args.data };
        clients.set(row.clientId, row);
        return row;
      },
      async update(args: { where: { clientId: string }; data: { disabled: boolean } }) {
        const row = clients.get(args.where.clientId);
        if (!row) throw new Error('not found');
        const next = { ...row, disabled: args.data.disabled };
        clients.set(next.clientId, next);
        return next;
      },
      async findMany() {
        return [...clients.values()].sort((a, b) => a.clientId.localeCompare(b.clientId));
      },
    },
    oauthClientResource: {
      async upsert(args: {
        where: { clientId_resourceId: { clientId: string; resourceId: string } };
        create: { clientId: string; resourceId: string };
      }) {
        const { clientId, resourceId } = args.where.clientId_resourceId;
        const key = `${clientId}\u0000${resourceId}`;
        const current = links.get(key);
        if (current) return current;
        const row = { clientId, resourceId };
        links.set(key, row);
        return row;
      },
    },
  };
  return {
    db: db as unknown as PrismaClient,
    count: () => clients.size,
    links: () => links.size,
    row: (clientId: string) => clients.get(clientId),
  };
}

const clientId = 'https://oauth.fixture.test/client.json';
const seed = {
  clientId,
  name: 'Fixture Agent',
  redirectUris: ['http://127.0.0.1:43210/callback'],
  resource: 'https://api.memo.test/mcp',
};

describe('OAuth client seeding', () => {
  it('creates one managed client and one resource link across repeated runs', async () => {
    const memory = memoryDb();
    const first = await seedOAuthClient(memory.db, seed);
    const second = await seedOAuthClient(memory.db, seed);

    expect(first.status).toBe('created');
    expect(second.status).toBe('exists');
    expect(memory.count()).toBe(1);
    expect(memory.links()).toBe(1);
    expect(memory.row(clientId)).toMatchObject({
      disabled: false,
      clientDiscoveryId: null,
      requirePKCE: true,
      tokenEndpointAuthMethod: 'none',
      redirectUris: ['http://127.0.0.1:43210/callback'],
      scopes: ['goals:read', 'tasks:read', 'offline_access'],
    });
  });

  it('does not reset an operator-suspended client on re-seed', async () => {
    const memory = memoryDb();
    await seedOAuthClient(memory.db, seed);
    expect((await disableOAuthClient(memory.db, clientId)).status).toBe('disabled');
    expect((await seedOAuthClient(memory.db, seed)).status).toBe('exists');
    expect(memory.row(clientId)?.disabled).toBe(true);
    expect((await disableOAuthClient(memory.db, clientId)).status).toBe('unchanged');
    expect((await enableOAuthClient(memory.db, clientId)).status).toBe('enabled');
    expect(memory.row(clientId)?.disabled).toBe(false);
  });

  it('accepts the shared write scopes and rejects unknown scopes or non-https client ids', async () => {
    const memory = memoryDb();
    const withWrite = await seedOAuthClient(memory.db, {
      ...seed,
      scopes: ['goals:read', 'goals:write', 'tasks:write'],
    });
    expect(withWrite.scopes).toEqual(['goals:read', 'goals:write', 'tasks:write']);
    await expect(seedOAuthClient(memory.db, { ...seed, scopes: ['admin:write'] })).rejects.toThrow(
      /not available to OAuth clients/,
    );
    await expect(
      seedOAuthClient(memory.db, { ...seed, clientId: 'http://oauth.fixture.test/client.json' }),
    ).rejects.toThrow(/must use https/);
    await expect(seedOAuthClient(memory.db, { ...seed, redirectUris: ['*'] })).rejects.toThrow(
      /wildcard/,
    );
  });

  it('lists clients with their discovery origin', async () => {
    const memory = memoryDb();
    await seedOAuthClient(memory.db, seed);
    expect(await listOAuthClients(memory.db)).toEqual([
      {
        clientId,
        name: 'Fixture Agent',
        disabled: false,
        createdAt: expect.any(String),
        redirectUris: ['http://127.0.0.1:43210/callback'],
        scopes: ['goals:read', 'tasks:read', 'offline_access'],
        discovery: 'managed',
      },
    ]);
  });
});

describe('OAuth client admin command', () => {
  it('emits one audit record with actor, time and client id', async () => {
    const memory = memoryDb();
    const lines: string[] = [];
    const now = new Date('2026-11-19T00:00:00.000Z');
    const code = await runOAuthClientAdmin(
      [
        'seed',
        '--client-id',
        clientId,
        '--name',
        'Fixture Agent',
        '--redirect-uri',
        seed.redirectUris[0]!,
        '--resource',
        seed.resource,
        '--actor',
        'ops-runner',
      ],
      { db: memory.db, now, write: (line) => lines.push(line) },
    );
    expect(code).toBe(0);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      kind: 'eag.oauth_client.audit',
      at: now.toISOString(),
      actor: 'ops-runner',
      action: 'seed',
      clientId,
      result: 'created',
      resource: seed.resource,
    });
  });

  it('reports a missing client as a failed disable', async () => {
    const memory = memoryDb();
    const lines: string[] = [];
    const code = await runOAuthClientAdmin(['disable', '--client-id', clientId], {
      db: memory.db,
      write: (line) => lines.push(line),
    });
    expect(code).toBe(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ action: 'disable', result: 'missing' });
  });

  it('rejects unknown flags and commands before touching the database', () => {
    expect(() => parseCommand(['seed', '--client-id'])).toThrow(/missing value/);
    expect(() => parseCommand(['rotate'])).toThrow(/unknown command/);
    expect(() => parseCommand([])).toThrow(/command is required/);
  });
});
