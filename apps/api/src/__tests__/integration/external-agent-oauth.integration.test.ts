import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { prisma } from '@memoflow/database';
import { IdentityId } from '@memoflow/domain-shared';
import { createAccountPrismaActiveQuery } from '@memoflow/account';
import { createCloudAuth } from '@memoflow/cloud-auth/server';
import {
  cleanAll,
  disconnectPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';

const issuer = 'https://api.memo.test/api/auth';
const resource = 'https://api.memo.test/mcp';
const origin = 'https://app.memo.test';
const clientId = 'https://oauth.fixture.test/client.json';
const callback = 'http://127.0.0.1:43210/callback';
const TokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  scope: z.string(),
  expires_in: z.number(),
});

function runtime(baseUrl = issuer, resourceUri = resource) {
  return createCloudAuth({
    database: prisma,
    baseUrl,
    secret: 'eag-integration-fixture-only-secret-thirty-two-characters',
    deviceVerificationUrl: `${origin}/auth/device`,
    trustedOrigins: [origin],
    userProvisioner: { provision: async () => {} },
    emailDelivery: { send: async () => {} },
    rateLimit: { enabled: false },
    externalAgents: {
      resource: resourceUri,
      webOrigin: origin,
      allowedClientIds: [clientId],
      accountIsActive: createAccountPrismaActiveQuery(prisma),
    },
  });
}
async function fixture() {
  const userId = String(IdentityId.generate());
  await seedAccount({ id: userId });
  const session = randomBytes(32).toString('hex');
  await prisma.cloudAuthSession.create({
    data: { userId, token: session, expiresAt: new Date(Date.now() + 86400_000) },
  });
  const auth = runtime();
  const discovery = await auth.handler(
    new Request('https://api.memo.test/.well-known/oauth-authorization-server/api/auth'),
  );
  expect(discovery.status).toBe(200);
  await prisma.oauthClient.create({
    data: {
      clientId,
      name: 'Fixture Agent',
      redirectUris: [callback],
      scopes: ['goals:read', 'tasks:read', 'offline_access'],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      requirePKCE: true,
      tokenEndpointAuthMethod: 'none',
      disabled: false,
      skipConsent: false,
    },
  });
  await prisma.oauthClientResource.create({ data: { clientId, resourceId: resource } });
  return { auth, userId, session };
}
async function authorize(
  f: Awaited<ReturnType<typeof fixture>>,
  scopes = 'goals:read tasks:read offline_access',
) {
  const verifier = randomBytes(32).toString('base64url');
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: 'code',
    scope: scopes,
    resource,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    state: randomUUID(),
  });
  const response = await f.auth.handler(
    new Request(`${issuer}/oauth2/authorize?${query}`, {
      headers: { authorization: `Bearer ${f.session}`, accept: 'application/json' },
    }),
  );
  const redirect = z.object({ url: z.string() }).parse(await response.json());
  let url = new URL(redirect.url);
  if (url.origin === origin) {
    const consent = await f.auth.handler(
      new Request(`${issuer}/oauth2/consent`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${f.session}`,
          origin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ accept: true, oauth_query: url.search.slice(1) }),
      }),
    );
    expect(consent.status).toBe(200);
    url = new URL(z.object({ url: z.string() }).parse(await consent.json()).url);
  }
  expect(url.searchParams.get('iss')).toBe(issuer);
  const exchange = () =>
    f.auth.handler(
      new Request(`${issuer}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code: url.searchParams.get('code') ?? '',
          code_verifier: verifier,
          redirect_uri: callback,
          resource,
        }),
      }),
    );
  const tokenResponse = await exchange();
  const body: unknown = await tokenResponse.json();
  expect(
    tokenResponse.status,
    JSON.stringify(TokenSchema.safeParse(body).success ? { issued: true } : body),
  ).toBe(200);
  return { ...TokenSchema.parse(body), exchange };
}
async function refresh(auth: ReturnType<typeof runtime>, token: string) {
  return auth.handler(
    new Request(`${issuer}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: token,
        resource,
      }),
    }),
  );
}

describe('external-agent OAuth durable lifecycle', () => {
  beforeEach(async () => {
    await cleanAll();
    await prisma.oauthClient.deleteMany();
  });
  afterAll(async () => {
    await cleanAll();
    await prisma.oauthClient.deleteMany();
    await disconnectPrisma();
  });

  it('binds provider consent and refreshed tokens to one connection; reauthorization cannot revive revoked tokens', async () => {
    const f = await fixture();
    const issued = await authorize(f);
    expect(issued.expires_in).toBe(600);
    const principal = await f.auth.externalAgents!.authenticate(`Bearer ${issued.access_token}`);
    expect(principal).toMatchObject({
      identityId: f.userId,
      credentialType: 'oauth',
      scopes: ['goals:read', 'tasks:read'],
    });
    const response = await refresh(f.auth, issued.refresh_token!);
    expect(response.status).toBe(200);
    const rotated = TokenSchema.parse(await response.json());
    expect(
      (await f.auth.externalAgents!.authenticate(`Bearer ${rotated.access_token}`))?.credentialId,
    ).toBe(principal!.credentialId);
    await f.auth.externalAgents!.revoke(f.userId, principal!.credentialId);
    expect(await f.auth.externalAgents!.authenticate(`Bearer ${issued.access_token}`)).toBeNull();
    expect((await refresh(f.auth, issued.refresh_token!)).status).toBe(400);
    const newGrant = await authorize(f);
    const newPrincipal = await f.auth.externalAgents!.authenticate(
      `Bearer ${newGrant.access_token}`,
    );
    expect(newPrincipal?.credentialId).not.toBe(principal!.credentialId);
    expect(await f.auth.externalAgents!.authenticate(`Bearer ${rotated.access_token}`)).toBeNull();
    expect((await refresh(f.auth, rotated.refresh_token!)).status).toBe(400);
  });

  it('serializes concurrent refresh across runtimes, tolerates overlap, and rejects old reuse after overlap', async () => {
    const f = await fixture();
    const issued = await authorize(f);
    const responses = await Promise.all([
      refresh(f.auth, issued.refresh_token!),
      refresh(runtime(), issued.refresh_token!),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const tokens = await Promise.all(responses.map(async (r) => TokenSchema.parse(await r.json())));
    expect(tokens[0].refresh_token).toBe(tokens[1].refresh_token);
    const retry = TokenSchema.parse(await (await refresh(f.auth, issued.refresh_token!)).json());
    expect(retry.refresh_token).toBe(tokens[0].refresh_token);
    await prisma.oauthRefreshToken.updateMany({
      where: { userId: f.userId, revoked: { not: null } },
      data: { rotationReplayExpiresAt: new Date(Date.now() - 1000) },
    });
    expect((await refresh(f.auth, issued.refresh_token!)).status).toBe(400);
    expect(
      await f.auth.externalAgents!.authenticate(`Bearer ${tokens[0].access_token}`),
    ).toBeNull();
    expect((await refresh(f.auth, tokens[0].refresh_token!)).status).toBe(400);
  });

  it('applies consent scope reduction and account closure to existing access and refresh tokens', async () => {
    const f = await fixture();
    const issued = await authorize(f);
    await prisma.oauthConsent.updateMany({
      where: { userId: f.userId },
      data: { scopes: ['goals:read', 'offline_access'] },
    });
    expect(
      (await f.auth.externalAgents!.authenticate(`Bearer ${issued.access_token}`))?.scopes,
    ).toEqual(['goals:read']);
    expect((await refresh(f.auth, issued.refresh_token!)).status).toBe(400);
    await prisma.cloudAuthUser.update({
      where: { id: f.userId },
      data: { disabledAt: new Date() },
    });
    expect(await f.auth.externalAgents!.authenticate(`Bearer ${issued.access_token}`)).toBeNull();
    expect((await refresh(f.auth, issued.refresh_token!)).status).toBe(400);
  });

  it('ends online authority after RFC 7009 refresh revocation and authorization-code replay', async () => {
    const f = await fixture();
    const issued = await authorize(f);
    const revoke = await f.auth.handler(
      new Request(`${issuer}/oauth2/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          token: issued.refresh_token!,
          token_type_hint: 'refresh_token',
        }),
      }),
    );
    expect(revoke.status).toBe(200);
    expect(await f.auth.externalAgents!.authenticate(`Bearer ${issued.access_token}`)).toBeNull();
    expect((await refresh(f.auth, issued.refresh_token!)).status).toBe(400);
    const next = await authorize(f);
    expect((await next.exchange()).status).toBe(400);
    expect(await f.auth.externalAgents!.authenticate(`Bearer ${next.access_token}`)).toBeNull();
  });

  it('does not issue a refresh token without offline_access and keeps first-party sessions separate', async () => {
    const f = await fixture();
    const issued = await authorize(f, 'goals:read');
    expect(issued.refresh_token).toBeUndefined();
    expect(
      (await f.auth.externalAgents!.authenticate(`Bearer ${issued.access_token}`))?.scopes,
    ).toEqual(['goals:read']);
    expect(await f.auth.externalAgents!.authenticate(`Bearer ${f.session}`)).toBeNull();
    expect(
      await f.auth.resolvePrincipal(
        new Headers({ authorization: `Bearer ${issued.access_token}` }),
      ),
    ).toBeNull();
  });

  it('rejects wrong issuer/audience, tampered signatures and expired product connections', async () => {
    const f = await fixture();
    const issued = await authorize(f);
    const authorization = `Bearer ${issued.access_token}`;
    expect(
      await runtime('https://other.memo.test/api/auth').externalAgents!.authenticate(authorization),
    ).toBeNull();
    expect(
      await runtime(issuer, 'https://api.memo.test/other-resource').externalAgents!.authenticate(
        authorization,
      ),
    ).toBeNull();
    const parts = issued.access_token.split('.');
    parts[2] = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1);
    expect(await f.auth.externalAgents!.authenticate(`Bearer ${parts.join('.')}`)).toBeNull();
    await prisma.externalAgentConnection.updateMany({
      where: { userId: f.userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await f.auth.externalAgents!.authenticate(authorization)).toBeNull();
    expect((await refresh(f.auth, issued.refresh_token!)).status).toBe(400);
  });

  it('rolls back a failed refresh persistence operation so the original token remains usable', async () => {
    const f = await fixture();
    const issued = await authorize(f);
    await prisma.$executeRaw`CREATE FUNCTION eag04_fail_refresh_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected refresh persistence failure'; END; $$`;
    try {
      await prisma.$executeRaw`CREATE TRIGGER eag04_fail_refresh_insert BEFORE INSERT ON "oauthRefreshToken" FOR EACH ROW EXECUTE FUNCTION eag04_fail_refresh_insert()`;
      const outcome = await refresh(f.auth, issued.refresh_token!).then(
        (response) => ({ kind: 'http' as const, status: response.status }),
        (error: unknown) => ({ kind: 'error' as const, error }),
      );
      if (outcome.kind === 'http') expect(outcome.status).toBeGreaterThanOrEqual(500);
      // A PostgreSQL-aborted outer transaction may surface at the host boundary.
      else expect(outcome.error).toBeInstanceOf(Error);
    } finally {
      await prisma.$executeRaw`DROP TRIGGER IF EXISTS eag04_fail_refresh_insert ON "oauthRefreshToken"`;
      await prisma.$executeRaw`DROP FUNCTION eag04_fail_refresh_insert()`;
    }
    expect((await refresh(f.auth, issued.refresh_token!)).status).toBe(200);
    expect(
      await f.auth.externalAgents!.authenticate(`Bearer ${issued.access_token}`),
    ).not.toBeNull();
  });
});
