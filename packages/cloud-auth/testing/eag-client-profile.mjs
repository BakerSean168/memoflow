// EAG-01 only: loopback provider fixture; no real user or owner data.
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { toNodeHandler as authNodeHandler } from 'better-auth/node';
import { jwt } from 'better-auth/plugins';
import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp, requireMcpAuth } from '@better-auth/mcp';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import express from 'express';

const app = express();
const http = app.listen(0, '127.0.0.1', () => {
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  const origin = `http://127.0.0.1:${address.port}`;
  const resource = `${origin}/mcp`;
  const database = Object.fromEntries(
    [
      'user',
      'session',
      'account',
      'verification',
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
    baseURL: `${origin}/api/auth`,
    secret: 'local-eag-profile-fixture-secret-only-32chars',
    database: memoryAdapter(database),
    plugins: [
      jwt(),
      mcp({
        resource,
        loginPage: '/login',
        consentPage: '/consent',
        scopes: ['goals:read', 'tasks:read'],
        refreshTokenReuseInterval: 0,
      }),
      cimd({ metadataProfile: 'mcp-2026-07-28', fetchClientMetadataResource }),
    ],
  });
  const sdk = createMcpHandler(
    () => new McpServer({ name: 'eag-client-profile', version: '1.0.0' }),
    { legacy: 'reject' },
  );
  const secured = requireMcpAuth(auth, (req) => sdk.fetch(req), { resource });
  app.use((req, _res, next) => {
    if (req.path === '/api/auth/oauth2/authorize') {
      const query = new URL(req.originalUrl, origin).searchParams;
      console.log(
        JSON.stringify({
          event: 'authorization_attempt',
          clientId: query.get('client_id'),
          redirectUri: query.get('redirect_uri'),
          challengeMethod: query.get('code_challenge_method'),
          resource: query.get('resource'),
          scopes: query.get('scope'),
        }),
      );
    }
    next();
  });
  app.all('/mcp', toNodeHandler({ fetch: secured }));
  app.all('/.well-known/*splat', authNodeHandler(auth));
  app.all('/api/auth/*splat', authNodeHandler(auth));
  console.log(JSON.stringify({ event: 'listening', resource }));
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    http.closeAllConnections();
    http.close(() => process.exit(0));
  });
