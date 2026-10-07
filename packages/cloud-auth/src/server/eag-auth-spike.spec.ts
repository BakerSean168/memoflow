import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp, requireMcpAuth } from '@better-auth/mcp';
import { betterAuth } from 'better-auth';
import { memoryAdapter, type MemoryDB } from 'better-auth/adapters/memory';
import { bearer, jwt } from 'better-auth/plugins';
import { deviceAuthorization } from 'better-auth/plugins/device-authorization';
import { describe, expect, it } from 'vitest';

const issuer = 'https://api.memo.test/api/auth';
const resource = 'https://api.memo.test/mcp';

// A provider API/schema experiment, not persistence/revocation evidence.
function fixture() {
  const memory: MemoryDB = Object.fromEntries(
    [
      'cloudAuthUser',
      'cloudAuthSession',
      'cloudAuthProviderAccount',
      'cloudAuthVerification',
      'cloudAuthDeviceCode',
      'jwks',
      'oauthClient',
      'oauthResource',
      'oauthClientResource',
      'oauthAccessToken',
      'oauthRefreshToken',
      'oauthConsent',
      'oauthClientAssertion',
    ].map((name) => [name, []]),
  );
  const auth = betterAuth({
    baseURL: issuer,
    secret: 'eag-spike-only-secret-with-at-least-32-characters',
    database: memoryAdapter(memory),
    user: { modelName: 'cloudAuthUser' },
    session: { modelName: 'cloudAuthSession' },
    account: { modelName: 'cloudAuthProviderAccount' },
    verification: { modelName: 'cloudAuthVerification' },
    emailAndPassword: { enabled: true },
    plugins: [
      bearer(),
      deviceAuthorization({
        validateClient: (id) => id === 'memoflow-desktop',
        schema: { deviceCode: { modelName: 'cloudAuthDeviceCode' } },
      }),
      jwt(),
      mcp({
        loginPage: '/auth/login',
        consentPage: '/auth/consent',
        resource,
        scopes: ['openid', 'offline_access', 'goals:read', 'tasks:read'],
        accessTokenExpiresIn: 600,
        refreshTokenReuseInterval: 0,
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' }),
    ],
  });
  return { auth, memory };
}

describe('EAG-01 Better Auth provider composition', () => {
  it('exposes discovery, PKCE and scoped resource while keeping DCR closed', async () => {
    const { auth } = fixture();
    const response = await auth.api.getOAuthServerConfig();
    expect(response).toMatchObject({
      issuer,
      authorization_endpoint: `${issuer}/oauth2/authorize`,
      token_endpoint: `${issuer}/oauth2/token`,
      code_challenge_methods_supported: ['S256'],
      client_id_metadata_document_supported: true,
    });
    expect(response.registration_endpoint).toBeUndefined();
    const metadata = await auth.handler(
      new Request('https://api.memo.test/.well-known/oauth-protected-resource/mcp'),
    );
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({
      resource,
      authorization_servers: [issuer],
      scopes_supported: ['goals:read', 'tasks:read'],
    });
  });

  it('preserves session bearer and restricted desktop device endpoints', async () => {
    const { auth } = fixture();
    const context = await auth.$context;
    expect(Object.keys(context.tables)).toEqual(
      expect.arrayContaining([
        'user',
        'session',
        'deviceCode',
        'jwks',
        'oauthClient',
        'oauthConsent',
        'oauthRefreshToken',
      ]),
    );
    const user = await auth.api.signUpEmail({
      body: {
        name: 'Fixture',
        email: 'eag-fixture@example.test',
        password: 'Fixture-password-123',
      },
    });
    if (!user.token) throw new Error('Missing fixture session');
    expect(
      await auth.api.getSession({
        headers: new Headers({ authorization: `Bearer ${user.token}` }),
      }),
    ).toMatchObject({ user: { id: user.user.id } });
    const denied = await auth.handler(
      new Request(`${issuer}/device/code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: 'external-agent' }),
      }),
    );
    expect(denied.status).toBe(400);
    const protectedHandler = requireMcpAuth(auth, async () => new Response('must not execute'), {
      resource,
    });
    const noAuth = await protectedHandler(new Request(resource, { method: 'POST' }));
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers.get('www-authenticate')).toContain('resource_metadata=');
    const sessionOnMcp = await protectedHandler(
      new Request(resource, { method: 'POST', headers: { authorization: `Bearer ${user.token}` } }),
    );
    expect(sessionOnMcp.status).toBe(401);
  });
  it('rejects missing PKCE and a redirect outside the registered exact URI', async () => {
    const { auth, memory } = fixture();
    await auth.$context;
    memory.oauthClient.push({
      id: 'fixture-client-row',
      clientId: 'eag-spike-client',
      name: 'EAG fixture',
      redirectUris: ['http://127.0.0.1:43210/callback'],
      tokenEndpointAuthMethod: 'none',
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      requirePKCE: true,
      scopes: ['goals:read', 'offline_access'],
      disabled: false,
    });
    memory.oauthClientResource.push({
      id: 'fixture-client-resource',
      clientId: 'eag-spike-client',
      resourceId: resource,
    });
    const base = {
      client_id: 'eag-spike-client',
      response_type: 'code',
      resource,
      scope: 'goals:read',
      redirect_uri: 'http://127.0.0.1:43210/callback',
    };
    const missingPkce = await auth.handler(
      new Request(`${issuer}/oauth2/authorize?${new URLSearchParams(base)}`),
    );
    expect(missingPkce.status).toBe(302);
    const pkceError = new URL(missingPkce.headers.get('location')!);
    expect(
      pkceError.searchParams.get('error'),
      pkceError.searchParams.get('error_description') ?? '',
    ).toBe('invalid_request');
    const invalidRedirect = await auth.handler(
      new Request(
        `${issuer}/oauth2/authorize?${new URLSearchParams({ ...base, redirect_uri: 'https://evil.example/callback', code_challenge: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG', code_challenge_method: 'S256' })}`,
      ),
    );
    expect(invalidRedirect.status).toBe(302);
    const redirectError = new URL(invalidRedirect.headers.get('location')!, issuer);
    expect(redirectError.origin).toBe(new URL(issuer).origin);
    expect(redirectError.searchParams.get('error')).toBe('invalid_redirect');
  });
});
