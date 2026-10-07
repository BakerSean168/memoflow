import { describe, expect, it, vi } from 'vitest';
import { memoryAdapter, type MemoryDB } from 'better-auth/adapters/memory';
import { createCloudAuth } from './cloud-auth';

const issuer = 'https://api.memo.test/api/auth';
const resource = 'https://api.memo.test/mcp';

describe('production external-agent OAuth composition', () => {
  it('publishes resource-bound discovery with PKCE and CIMD, keeping DCR closed', async () => {
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
    const auth = createCloudAuth(
      {
        database: {} as never,
        baseUrl: issuer,
        secret: 'oauth-fixture-only-secret-at-least-thirty-two-characters',
        deviceVerificationUrl: 'https://app.memo.test/auth/device',
        trustedOrigins: ['https://app.memo.test'],
        userProvisioner: { provision: vi.fn() },
        emailDelivery: { send: vi.fn() },
        externalAgents: {
          resource,
          webOrigin: 'https://app.memo.test',
          allowedClientIds: ['https://chatgpt.com/oauth/codex/client.json'],
          accountIsActive: async () => true,
        },
      },
      { database: memoryAdapter(memory) },
    );
    const response = await auth.handler(
      new Request('https://api.memo.test/.well-known/oauth-authorization-server/api/auth'),
    );
    expect(response.status).toBe(200);
    const metadata = await response.json();
    expect(metadata).toMatchObject({
      issuer,
      authorization_endpoint: `${issuer}/oauth2/authorize`,
      token_endpoint: `${issuer}/oauth2/token`,
      code_challenge_methods_supported: ['S256'],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
    expect(metadata.registration_endpoint).toBeUndefined();
    const protectedResource = await auth.handler(
      new Request('https://api.memo.test/.well-known/oauth-protected-resource/mcp'),
    );
    expect(protectedResource.status).toBe(200);
    expect(await protectedResource.json()).toMatchObject({
      resource,
      authorization_servers: [issuer],
      scopes_supported: ['goals:read', 'tasks:read'],
    });
  });
});
