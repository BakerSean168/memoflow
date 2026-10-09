import type { RequestHandler } from 'express';
import express from 'express';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createBusinessDataSummaryReader } from '../server/application/business-data-summary';
import { describe, expect, it, vi } from 'vitest';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import type { AccountApplicationPort } from '../server/application';
import { composeAccountView, registerAccountRoutes } from './routes';

type RegisteredRoute = {
  method: string;
  path: string;
  request?: Record<string, unknown>;
  responses?: Record<string, unknown>;
};

class TestOpenApiRegistry implements OpenApiRegistryLike {
  readonly paths: RegisteredRoute[] = [];

  registerPath(route: Record<string, unknown>): void {
    this.paths.push(route as RegisteredRoute);
  }

  register(): void {}
}

const authMiddleware = ((_, __, next) => next()) as RequestHandler;

it('serves data-summary only for the authenticated principal and ignores a requested other identity', async () => {
  const seen: string[] = [];
  const read = createBusinessDataSummaryReader({
    repository: async (identityId) => {
      seen.push(identityId);
      return true;
    },
  });
  const auth: RequestHandler = (req, res, next) => {
    if (req.get('authorization') !== 'Bearer summary-test') {
      res.sendStatus(401);
      return;
    }
    Object.assign(req, { user: { identityId: 'principal-a', sessionId: 'session-a' } });
    next();
  };
  const app = express();
  app.use(
    '/accounts',
    registerAccountRoutes(createAccountApiStub(), { auth, requireRole: () => auth }, null, read),
  );
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    expect((await fetch(`${origin}/accounts/me/data-summary`)).status).toBe(401);
    const response = await fetch(`${origin}/accounts/me/data-summary?identityId=victim`, {
      headers: { authorization: 'Bearer summary-test' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { state: 'non_empty' } });
    expect(seen).toEqual(['principal-a']);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

function createAccountApiStub(): AccountApplicationPort {
  return {
    listAccounts: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    closeAccount: vi.fn(),
  } as unknown as AccountApplicationPort;
}

function getRegisteredRoute(
  registry: TestOpenApiRegistry,
  method: string,
  path: string,
): RegisteredRoute {
  const route = registry.paths.find(
    (candidate) => candidate.method === method && candidate.path === path,
  );

  expect(route).toBeDefined();
  return route!;
}

function getResponseSchema(
  route: RegisteredRoute,
  status: number,
): {
  safeParse: (value: unknown) => { success: boolean };
  _def?: { typeName?: string };
} {
  const responses = route.responses as
    Record<string, { content?: Record<string, unknown> }> | undefined;
  const response = responses?.[String(status)];
  const schema = (response?.content as Record<string, unknown> | undefined)?.[
    'application/json'
  ] as
    | {
        schema?: {
          safeParse: (value: unknown) => { success: boolean };
          _def?: { typeName?: string };
        };
      }
    | undefined;
  return (
    schema?.schema ??
    (response as unknown as { safeParse: (value: unknown) => { success: boolean } })
  );
}

function getJsonBodySchema(route: RegisteredRoute): {
  safeParse: (value: unknown) => { success: boolean };
} {
  return (
    (
      (route.request?.body as Record<string, unknown> | undefined)?.content as
        Record<string, unknown> | undefined
    )?.['application/json'] as Record<string, unknown> | undefined
  )?.schema as {
    safeParse: (value: unknown) => { success: boolean };
  };
}

const BASE = '/api/v1/accounts';

describe('account route contracts', () => {
  it('composes login identity without leaking session/provider capability', () => {
    const account = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      status: 'Active',
      profile: {
        nickname: 'Memo',
        realName: null,
        avatarUrl: null,
        bio: null,
        gender: 'PreferNotToSay',
        birthday: null,
      },
      createdAt: 1,
      updatedAt: 2,
      closedAt: null,
    } as const;

    const view = composeAccountView(account, {
      user: {
        identityId: account.id,
        email: 'login@example.com',
        emailVerified: true,
        sessionId: 'must-not-leak',
        provider: 'must-not-leak',
      },
    } as never);

    expect(view.cloudIdentity).toEqual({
      identityId: account.id,
      email: 'login@example.com',
      emailVerified: true,
    });
    expect(view.cloudIdentity).not.toHaveProperty('sessionId');
    expect(view.cloudIdentity).not.toHaveProperty('provider');
    expect(view.account).not.toHaveProperty('email');
  });
  it('GET /me is registered with correct path', () => {
    const registry = new TestOpenApiRegistry();

    registerAccountRoutes(
      createAccountApiStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const route = getRegisteredRoute(registry, 'get', `${BASE}/me`);
    expect(route).toBeDefined();
  });

  it('GET /me has a 200 response schema', () => {
    const registry = new TestOpenApiRegistry();

    registerAccountRoutes(
      createAccountApiStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const route = getRegisteredRoute(registry, 'get', `${BASE}/me`);
    const responseSchema = getResponseSchema(route, 200);
    expect(responseSchema).toBeDefined();
    expect(responseSchema.safeParse).toBeDefined();
  });

  it('PUT /me is registered with correct path', () => {
    const registry = new TestOpenApiRegistry();

    registerAccountRoutes(
      createAccountApiStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const route = getRegisteredRoute(registry, 'put', `${BASE}/me`);
    expect(route).toBeDefined();
  });

  it('PUT /me has a body schema', () => {
    const registry = new TestOpenApiRegistry();

    registerAccountRoutes(
      createAccountApiStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const route = getRegisteredRoute(registry, 'put', `${BASE}/me`);
    const bodySchema = getJsonBodySchema(route);
    expect(bodySchema).toBeDefined();
  });
});
