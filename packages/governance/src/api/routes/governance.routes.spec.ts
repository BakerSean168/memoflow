import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { GovernanceApplicationPort } from '../../server/application';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import { registerGovernanceRoutes } from './index';
import { expressAdapter } from '@memoflow/utils/result';
import { ok } from '@memoflow/contracts/result';
import {
  createAuthenticatedIpcWrapper,
  type IElectronModuleContext,
} from '@memoflow/contracts/electron';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { GovernanceController } from '../../server/transport/governance.controller';

type RegisteredRoute = {
  method: string;
  path: string;
  request?: Record<string, unknown>;
};

class TestOpenApiRegistry implements OpenApiRegistryLike {
  readonly paths: RegisteredRoute[] = [];

  registerPath(route: Record<string, unknown>): void {
    this.paths.push(route as RegisteredRoute);
  }

  register(): void {}
}

const authMiddleware = ((_, __, next) => next()) as RequestHandler;

function createUseCaseStub(): GovernanceApplicationPort {
  return {
    createRule: vi.fn(() => ok(null as never)),
    updateRule: vi.fn(() => ok(null as never)),
    deleteRule: vi.fn(() => ok(null as never)),
    getRule: vi.fn(() => ok(null as never)),
    listRules: vi.fn(() => ok([] as never)),
    searchRules: vi.fn(() => ok([] as never)),
    getRevisions: vi.fn(() => ok(null as never)),
    exportRuleBundle: vi.fn(() => ok(null as never)),
  } as GovernanceApplicationPort;
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

describe('governance route contracts', () => {
  it('registers resource-first rule and revision routes explicitly', () => {
    const registry = new TestOpenApiRegistry();

    registerGovernanceRoutes(
      createUseCaseStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    expect(
      registry.paths.some(
        (route) => route.method === 'get' && route.path === '/api/v1/governance/rules/search',
      ),
    ).toBe(true);
    expect(
      registry.paths.some(
        (route) => route.method === 'get' && route.path === '/api/v1/governance/rules/bundle',
      ),
    ).toBe(true);
    expect(
      registry.paths.some(
        (route) =>
          route.method === 'get' && route.path === '/api/v1/governance/rules/{id}/revisions',
      ),
    ).toBe(true);
    expect(
      registry.paths.some(
        (route) => route.method === 'get' && route.path === '/api/v1/governance/rules/{id}',
      ),
    ).toBe(true);
  });

  it('keeps q alias out of OpenAPI while the canonical query schema still requires query', () => {
    const registry = new TestOpenApiRegistry();

    registerGovernanceRoutes(
      createUseCaseStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const searchRoute = getRegisteredRoute(registry, 'get', '/api/v1/governance/rules/search');
    const searchQuerySchema = searchRoute.request?.query as {
      safeParse: (value: unknown) => { success: boolean };
    };

    expect(searchQuerySchema.safeParse({ query: 'ddd' }).success).toBe(true);
    expect(searchQuerySchema.safeParse({ q: 'ddd' }).success).toBe(false);
  });

  it('registers create rule schema as the canonical rule resource payload', () => {
    const registry = new TestOpenApiRegistry();

    registerGovernanceRoutes(
      createUseCaseStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const createSchema = getJsonBodySchema(
      getRegisteredRoute(registry, 'post', '/api/v1/governance/rules'),
    );

    expect(
      createSchema.safeParse({
        code: 'DDD-001',
        title: 'Rule title',
        description: 'This is a valid description for governance rule testing.',
        severity: 'Mandatory',
        tags: ['ddd'],
        goodExamples: [
          {
            language: 'TypeScript',
            content: 'class Example {}',
          },
        ],
        badExamples: [
          {
            language: 'TypeScript',
            content: 'const broken = true',
          },
        ],
        authorId: 'user-1',
      }).success,
    ).toBe(true);
  });
});

describe('governance context parity — HTTP adapter vs IPC wrapper (RefArch Phase 2)', () => {
  const fixture: ExecutionContext = {
    requestId: 'req-governance-parity',
    traceId: 'req-governance-parity',
    startedAt: 1_700_000_000_123,
    source: 'ipc',
    identityId: 'identity-1',
    deviceId: 'desktop-app',
  };

  const validCreateRule = {
    code: 'DDD-100',
    title: 'Parity rule',
    description: 'Valid governance rule for the context parity test.',
    severity: 'Mandatory',
    tags: ['parity'],
    goodExamples: [{ language: 'TypeScript', content: 'class Example {}' }],
    badExamples: [{ language: 'TypeScript', content: 'const broken = true' }],
  };

  it('HTTP: the full fixture context reaches the GovernanceApplicationPort untruncated', async () => {
    const port = createUseCaseStub();
    const controller = new GovernanceController(port);
    const handler = expressAdapter((req, ctx) => controller.createRule(req.body, ctx), {
      successStatus: 201,
      extractContext: () => fixture,
    });

    const res = {
      statusCode: 0,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
    };
    await handler(
      {
        body: validCreateRule,
        user: { identityId: 'identity-1' },
        requestContext: fixture,
      },
      res,
    );

    expect(port.createRule).toHaveBeenCalledTimes(1);
    const [, received] = (port.createRule as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(received).toEqual(fixture);
    expect(res.statusCode).toBe(201);
  });

  it('IPC: the same fixture context reaches the same port method via withAuthenticatedValue', async () => {
    const port = createUseCaseStub();
    const controller = new GovernanceController(port);
    const withAuthenticatedValue = createAuthenticatedIpcWrapper();
    const ctx = {
      db: {},
      auth: { requireRequestContext: vi.fn().mockResolvedValue(fixture) },
    } as unknown as IElectronModuleContext;

    const result = await withAuthenticatedValue(ctx, async (requestContext) =>
      controller.createRule(validCreateRule, requestContext),
    );

    expect(result.ok).toBe(true);
    const [, received] = (port.createRule as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(received).toEqual(fixture);
  });
});
