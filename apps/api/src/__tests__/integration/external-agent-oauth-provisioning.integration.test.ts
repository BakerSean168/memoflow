import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createAccountPrismaActiveQuery } from '@memoflow/account';
import type { GatewayToolCheckpoint } from '@memoflow/agent-gateway';
import { createCloudAuth, createScopedPatService } from '@memoflow/cloud-auth/server';
import { prisma } from '@memoflow/database';
import { createGoalPrismaModule, createGoalPrismaPageQuery } from '@memoflow/goal';
import { createTimeContext } from '@memoflow/time';
import { IdentityId } from '@memoflow/utils/domain';
import {
  cleanAll,
  disconnectPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { bindGoalReadPort } from '../../modules/agent-gateway/goal-read.port';
import { composeAgentGatewayModule } from '../../modules/agent-gateway/module';
import { createRequestContextMiddleware } from '../../shared/infrastructure/http/middlewares/request-context.middleware';
import {
  disableOAuthClient,
  listOAuthClients,
  seedOAuthClient,
} from '../../scripts/oauth-client-admin';

const clientId = 'https://oauth.fixture.test/client.json';
const callback = 'http://127.0.0.1:43210/callback';
/** Real, publicly hosted CIMD documents used by external clients. */
const cimdClients = [
  {
    clientId: 'https://claude.ai/oauth/claude-code-client-metadata',
    redirectUri: 'http://127.0.0.1/callback',
    name: 'Claude Code',
  },
  {
    clientId: 'https://chatgpt.com/oauth/client.json',
    redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
    name: 'ChatGPT',
  },
] as const;
const seededClient = { clientId, redirectUri: callback } as const;
const TokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  scope: z.string(),
  expires_in: z.number(),
});

const accountIsActive = createAccountPrismaActiveQuery(prisma);

/**
 * Boots the same Express surface the API host uses: Better Auth under
 * `/api/auth`, the OAuth well-known documents, and the hosted MCP endpoint.
 */
async function startApi(options: {
  readonly allowedClientIds: readonly string[];
  readonly cimdFetch?: (input: string, init?: RequestInit) => Promise<Response>;
}) {
  const app = express();
  app.use(createRequestContextMiddleware({ observer: { complete() {} } }));
  app.use(express.json({ limit: '256kb' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;
  const issuer = `${origin}/api/auth`;
  const resource = `${origin}/mcp`;
  const auth = createCloudAuth(
    {
      database: prisma,
      baseUrl: issuer,
      secret: 'eag-provisioning-fixture-secret-thirty-two-characters',
      deviceVerificationUrl: `${origin}/auth/device`,
      trustedOrigins: [origin],
      userProvisioner: { provision: async () => {} },
      emailDelivery: { send: async () => {} },
      rateLimit: { enabled: false },
      externalAgents: {
        resource,
        webOrigin: origin,
        allowedClientIds: options.allowedClientIds,
        accountIsActive,
      },
    },
    options.cimdFetch ? { cimdFetch: options.cimdFetch } : {},
  );
  const handler = auth.expressHandler;
  app.all('/api/auth/*splat', handler);
  app.all(
    [
      '/.well-known/oauth-protected-resource/mcp',
      '/.well-known/oauth-authorization-server/api/auth',
    ],
    handler,
  );
  const gateway = composeAgentGatewayModule({
    enabled: true,
    toolCheckpoint: (async (_principal, _tool, work) => work()) satisfies GatewayToolCheckpoint,
    audience: resource,
    cursorSecret: 'provisioning-fixture-secret-'.repeat(2),
    trustedOrigins: [],
    pats: createScopedPatService({ database: prisma, audience: resource, accountIsActive }),
    oauth: auth.externalAgents,
    goals: bindGoalReadPort(createGoalPrismaPageQuery(prisma)),
    audit() {},
    admission: {
      start: async () => {},
      destroy: async () => {},
      consumeIp: async () => true,
      consumeOwner: async () => true,
    },
  });
  await gateway.register({
    app,
    router: express.Router(),
    middleware: {
      auth: (_req, res) => res.sendStatus(401),
      requireEmailVerified: (_req, _res, next) => next(),
      requireRole: () => (_req, res) => res.sendStatus(403),
    },
  } as never);
  return { server, origin, issuer, resource, auth };
}

type Api = Awaited<ReturnType<typeof startApi>>;

async function login(): Promise<string> {
  const userId = String(IdentityId.generate());
  await seedAccount({ id: userId });
  const session = randomBytes(32).toString('hex');
  await prisma.cloudAuthSession.create({
    data: { userId, token: session, expiresAt: new Date(Date.now() + 86400_000) },
  });
  const goal = createGoalPrismaModule(prisma, {
    taskBindingReadPort: {
      checkActiveTaskBindings: async () => ({ hasActiveBindings: false, activeCount: 0 }),
    },
    userTimeContextPort: {
      getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
    },
    relationCleanupFactory: () => ({ unlinkAllForGoal: async () => 0 }),
  });
  const created = await goal.api.createGoal(
    { name: 'OAuth provisioning fixture' },
    {
      identityId: userId,
      requestId: 'provisioning-fixture',
      traceId: 'provisioning-fixture',
      startedAt: Date.now(),
      source: 'http',
    },
  );
  if (!created.ok) throw new Error(created.error.message);
  return `${userId}\n${session}`;
}

interface ClientUnderTest {
  readonly clientId: string;
  readonly redirectUri: string;
}

async function authorize(
  api: Api,
  session: string,
  client: ClientUnderTest,
  scopes = 'goals:read tasks:read offline_access',
) {
  const verifier = randomBytes(32).toString('base64url');
  const query = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: 'code',
    scope: scopes,
    resource: api.resource,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    state: randomUUID(),
  });
  const response = await fetch(`${api.issuer}/oauth2/authorize?${query}`, {
    headers: { authorization: `Bearer ${session}`, accept: 'application/json' },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`authorize failed ${response.status}: ${body}`);
  const redirect = z.object({ url: z.string() }).parse(JSON.parse(body));
  let url = new URL(redirect.url);
  if (url.origin === api.origin) {
    const consent = await fetch(`${api.issuer}/oauth2/consent`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session}`,
        origin: api.origin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ accept: true, oauth_query: url.search.slice(1) }),
    });
    expect(consent.status).toBe(200);
    url = new URL(z.object({ url: z.string() }).parse(await consent.json()).url);
  }
  expect(url.searchParams.get('iss')).toBe(api.issuer);
  const exchange = () =>
    fetch(`${api.issuer}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: client.clientId,
        code: url.searchParams.get('code') ?? '',
        code_verifier: verifier,
        redirect_uri: client.redirectUri,
        resource: api.resource,
      }),
    });
  return { exchange, verifier };
}

async function issue(api: Api, session: string, client: ClientUnderTest) {
  const grant = await authorize(api, session, client);
  const response = await grant.exchange();
  const body: unknown = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  return TokenSchema.parse(body);
}

async function withClient<T>(audience: string, token: string, run: (client: Client) => Promise<T>) {
  const client = new Client({ name: 'oauth-provisioning-fixture', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(audience), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

describe('OAuth client provisioning', () => {
  beforeEach(async () => {
    await cleanAll();
    await prisma.oauthClient.deleteMany();
    await prisma.oauthResource.deleteMany();
  });
  afterAll(async () => {
    await cleanAll();
    await prisma.oauthClient.deleteMany();
    await prisma.oauthResource.deleteMany();
    await disconnectPrisma();
  });

  it('seeds one client, serves a goal read over MCP, and stops authority when disabled', async () => {
    const api = await startApi({ allowedClientIds: [clientId] });
    try {
      const seeded = await seedOAuthClient(prisma, {
        clientId,
        name: 'Fixture Agent',
        redirectUris: [callback],
        resource: api.resource,
      });
      const reseeded = await seedOAuthClient(prisma, {
        clientId,
        name: 'Fixture Agent',
        redirectUris: [callback],
        resource: api.resource,
      });
      expect([seeded.status, reseeded.status]).toEqual(['created', 'exists']);
      expect(await prisma.oauthClient.count({ where: { clientId } })).toBe(1);
      expect(
        await prisma.oauthClientResource.count({ where: { clientId, resourceId: api.resource } }),
      ).toBe(1);

      const [userId, session] = (await login()).split('\n') as [string, string];
      const token = await issue(api, session, seededClient);
      expect(
        await api.auth.externalAgents!.authenticate(`Bearer ${token.access_token}`),
      ).toMatchObject({ identityId: userId, credentialType: 'oauth' });

      const result = await withClient(api.resource, token.access_token, (client) =>
        client.callTool({ name: 'goal_search', arguments: { limit: 1 } }),
      );
      const structured = z
        .object({ items: z.array(z.object({ name: z.string() })), hasMore: z.boolean() })
        .parse(result.structuredContent);
      expect(structured.items.map((item) => item.name)).toEqual(['OAuth provisioning fixture']);

      expect((await disableOAuthClient(prisma, clientId)).status).toBe('disabled');
      expect(
        await api.auth.externalAgents!.authenticate(`Bearer ${token.access_token}`),
      ).toBeNull();
      const refresh = await fetch(`${api.issuer}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: clientId,
          refresh_token: token.refresh_token!,
          resource: api.resource,
        }),
      });
      expect(refresh.status).toBe(400);
      await expect(
        withClient(api.resource, token.access_token, async () => null),
      ).rejects.toThrow();
      expect((await listOAuthClients(prisma))[0]).toMatchObject({
        clientId,
        disabled: true,
        discovery: 'managed',
      });
    } finally {
      api.server.close();
    }
  });

  it('reports a suspended client instead of silently re-enabling it', async () => {
    await seedOAuthClient(prisma, {
      clientId,
      name: 'Fixture Agent',
      redirectUris: [callback],
      resource: 'https://api.memo.test/mcp',
    });
    await disableOAuthClient(prisma, clientId);
    expect(
      (
        await seedOAuthClient(prisma, {
          clientId,
          name: 'Fixture Agent',
          redirectUris: [callback],
          resource: 'https://api.memo.test/mcp',
        })
      ).status,
    ).toBe('exists');
    expect((await listOAuthClients(prisma))[0]?.disabled).toBe(true);
  });
});

/**
 * `EAG_OAUTH_CLIENT_IDS` matches whole URLs, never hosts or prefixes. These
 * cases pin that contract for the two ChatGPT entries: the Web client and the
 * Codex CLI client are independent allowlist entries, and a look-alike id can
 * neither fetch a document nor inherit either entry.
 */
describe('OAuth client allowlist exact matching', () => {
  const web = {
    clientId: 'https://chatgpt.com/oauth/client.json',
    redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
    name: 'ChatGPT',
  } as const;
  const codex = {
    clientId: 'https://chatgpt.com/oauth/codex/client.json',
    redirectUri: 'http://127.0.0.1:1455/callback',
    name: 'Codex CLI',
  } as const;
  const documents = new Map(
    [web, codex].map((client) => [
      client.clientId,
      {
        client_id: client.clientId,
        client_name: client.name,
        redirect_uris: [client.redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      },
    ]),
  );
  // Only the transport is replaced; document fetch, validation and persistence
  // stay on the production path.
  const cimdFetch = async (input: string) => {
    const document = documents.get(input);
    return document
      ? Response.json(document)
      : Response.json({ error: 'not_found' }, { status: 404 });
  };

  function authorizeRequest(api: Api, session: string, clientIdValue: string, redirectUri: string) {
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
      client_id: clientIdValue,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'goals:read tasks:read offline_access',
      resource: api.resource,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      state: randomUUID(),
    });
    return fetch(`${api.issuer}/oauth2/authorize?${query}`, {
      headers: { authorization: `Bearer ${session}`, accept: 'application/json' },
    });
  }

  it('accepts the exact Web CIMD and keeps the Codex entry independent', async () => {
    const api = await startApi({
      allowedClientIds: [web.clientId, codex.clientId],
      cimdFetch,
    });
    try {
      const [userId, session] = (await login()).split('\n') as [string, string];
      const webToken = await issue(api, session, web);
      expect(
        await prisma.oauthClient.findUnique({ where: { clientId: web.clientId } }),
      ).toMatchObject({ clientDiscoveryId: 'cimd', name: web.name });
      expect(
        await api.auth.externalAgents!.authenticate(`Bearer ${webToken.access_token}`),
      ).toMatchObject({ identityId: userId, scopes: ['goals:read', 'tasks:read'] });

      const codexToken = await issue(api, session, codex);
      expect(
        await prisma.oauthClient.findUnique({ where: { clientId: codex.clientId } }),
      ).toMatchObject({ clientDiscoveryId: 'cimd', name: codex.name });
      expect(
        await api.auth.externalAgents!.authenticate(`Bearer ${codexToken.access_token}`),
      ).toMatchObject({ identityId: userId, scopes: ['goals:read', 'tasks:read'] });
    } finally {
      api.server.close();
    }
  });

  it.each([
    ['trailing slash', 'https://chatgpt.com/oauth/client.json/'],
    ['query suffix', 'https://chatgpt.com/oauth/client.json?client=other'],
    ['look-alike host', 'https://chatgpt.com.evil.test/oauth/client.json'],
    ['insecure scheme', 'http://chatgpt.com/oauth/client.json'],
  ])('rejects a %s client id that is not allowlisted', async (_label, forgedClientId) => {
    const api = await startApi({
      allowedClientIds: [web.clientId, codex.clientId],
      cimdFetch,
    });
    try {
      const [, session] = (await login()).split('\n') as [string, string];
      const response = await authorizeRequest(api, session, forgedClientId, web.redirectUri);
      const body = await response.text();
      expect(response.status, body).toBeGreaterThanOrEqual(400);
      expect(await prisma.oauthClient.count()).toBe(0);
    } finally {
      api.server.close();
    }
  });
});

/**
 * Opt-in network check: `EAG_CIMD_E2E=1` fetches live Claude Code and ChatGPT Web
 * CIMD documents. It answers whether a CIMD client id creates its row during the
 * authorization request, so the runbook can rely on it instead of seeding.
 */
describe.skipIf(!process.env.EAG_CIMD_E2E)('CIMD just-in-time client registration', () => {
  beforeEach(async () => {
    await cleanAll();
    await prisma.oauthClient.deleteMany();
    await prisma.oauthResource.deleteMany();
  });
  afterAll(async () => {
    await cleanAll();
    await prisma.oauthClient.deleteMany();
    await prisma.oauthResource.deleteMany();
    await disconnectPrisma();
  });

  it.each(cimdClients)(
    'registers $name CIMD with the advertised token authentication',
    async ({ clientId: cimdClientId, redirectUri: cimdCallback, name }) => {
      // The production transport pins a resolve-once public DNS answer. Sandboxes
      // behind fake-IP DNS resolve every host to a reserved range, so only the
      // transport is swapped here; document fetch, validation and persistence
      // stay on the production path.
      const api = await startApi({
        allowedClientIds: [cimdClientId],
        cimdFetch: (input, init) => fetch(input, init),
      });
      try {
        expect(await prisma.oauthClient.count({ where: { clientId: cimdClientId } })).toBe(0);
        const [userId, session] = (await login()).split('\n') as [string, string];
        if (name === 'ChatGPT') {
          // ChatGPT advertises both none and private_key_jwt. Better Auth
          // selects signed JWT authentication for this official CIMD client.
          // This unsigned fixture must not bypass that requirement.
          const grant = await authorize(api, session, {
            clientId: cimdClientId,
            redirectUri: cimdCallback,
          });
          const registered = await prisma.oauthClient.findUnique({
            where: { clientId: cimdClientId },
          });
          expect(registered).toMatchObject({
            clientDiscoveryId: 'cimd',
            name: 'ChatGPT',
            tokenEndpointAuthMethod: 'private_key_jwt',
          });
          const unsigned = await grant.exchange();
          expect(unsigned.status).toBe(400);
          expect(await unsigned.json()).toMatchObject({ error: 'invalid_client' });
          return;
        }
        const token = await issue(api, session, {
          clientId: cimdClientId,
          redirectUri: cimdCallback,
        });

        const row = await prisma.oauthClient.findUnique({ where: { clientId: cimdClientId } });
        expect(row).toMatchObject({ clientDiscoveryId: 'cimd', name });
        expect(
          await api.auth.externalAgents!.authenticate(`Bearer ${token.access_token}`),
        ).toMatchObject({ identityId: userId, scopes: ['goals:read', 'tasks:read'] });

        const result = await withClient(api.resource, token.access_token, (client) =>
          client.callTool({ name: 'goal_search', arguments: { limit: 1 } }),
        );
        const structured = z
          .object({ items: z.array(z.object({ name: z.string() })) })
          .parse(result.structuredContent);
        expect(structured.items.map((item) => item.name)).toEqual(['OAuth provisioning fixture']);
        expect((await listOAuthClients(prisma))[0]).toMatchObject({
          clientId: cimdClientId,
          discovery: 'cimd',
        });
      } finally {
        api.server.close();
      }
    },
  );
});
