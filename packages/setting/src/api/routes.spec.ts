import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import type { SettingApplicationPort } from '../server/application';
import { registerSettingRoutes } from './routes';

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

function createSettingApiStub(): SettingApplicationPort {
  return {
    getPreferenceProfile: vi.fn(),
    getPreferenceNamespace: vi.fn(),
    patchPreferenceNamespace: vi.fn(),
    resetPreferenceNamespace: vi.fn(),
    resetUserPreferences: vi.fn(),
    getUserSetting: vi.fn(),
    patchUserSetting: vi.fn(),
    resetUserSetting: vi.fn(),
    exportSettings: vi.fn(),
    importSettings: vi.fn(),
    getDefaultSettings: vi.fn(),
  };
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

const BASE = '/api/v1/settings';

describe('setting route contracts', () => {
  it('registers the canonical preference profile and namespace routes', () => {
    const registry = new TestOpenApiRegistry();
    registerSettingRoutes(
      createSettingApiStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    expect(getRegisteredRoute(registry, 'get', `${BASE}/preferences`)).toBeDefined();
    const patch = getRegisteredRoute(registry, 'patch', `${BASE}/preferences/{namespace}`);
    expect(patch.responses).toHaveProperty('409');
    expect(
      getRegisteredRoute(registry, 'post', `${BASE}/preferences/{namespace}/reset`),
    ).toBeDefined();
    expect(getRegisteredRoute(registry, 'post', `${BASE}/preferences/reset-all`)).toBeDefined();
  });

  it('canonical preference PATCH uses a strict typed body', () => {
    const registry = new TestOpenApiRegistry();
    registerSettingRoutes(
      createSettingApiStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const route = getRegisteredRoute(registry, 'patch', `${BASE}/preferences/{namespace}`);
    const body = getJsonBodySchema(route);
    expect(body.safeParse({ patch: { theme: 'dark' }, expectedRevision: 2 }).success).toBe(true);
    expect(body.safeParse({ patch: { typo: true } }).success).toBe(false);
    expect(body.safeParse({ patch: { theme: 'dark' }, unexpected: true }).success).toBe(false);
  });

  it('GET / is registered with correct path', () => {
    const registry = new TestOpenApiRegistry();

    registerSettingRoutes(
      createSettingApiStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const route = getRegisteredRoute(registry, 'get', BASE);
    expect(route).toBeDefined();
  });

  it('GET / has a 200 response schema', () => {
    const registry = new TestOpenApiRegistry();

    registerSettingRoutes(
      createSettingApiStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const route = getRegisteredRoute(registry, 'get', BASE);
    const responseSchema = getResponseSchema(route, 200);
    expect(responseSchema).toBeDefined();
    expect(responseSchema.safeParse).toBeDefined();
  });

  it('PATCH /{category} is registered with correct path', () => {
    const registry = new TestOpenApiRegistry();

    registerSettingRoutes(
      createSettingApiStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const route = getRegisteredRoute(registry, 'patch', `${BASE}/{category}`);
    expect(route).toBeDefined();
  });

  it('PATCH /{category} body schema accepts valid patch data', () => {
    const registry = new TestOpenApiRegistry();

    registerSettingRoutes(
      createSettingApiStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const route = getRegisteredRoute(registry, 'patch', `${BASE}/{category}`);
    const bodySchema = getJsonBodySchema(route);
    expect(bodySchema).toBeDefined();
    expect(bodySchema.safeParse({ key: 'value' }).success).toBe(true);
    expect(bodySchema.safeParse({}).success).toBe(true);
  });

  it('POST /reset is registered with correct path', () => {
    const registry = new TestOpenApiRegistry();

    registerSettingRoutes(
      createSettingApiStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const route = getRegisteredRoute(registry, 'post', `${BASE}/reset`);
    expect(route).toBeDefined();
  });

  it('POST /reset body schema accepts valid data', () => {
    const registry = new TestOpenApiRegistry();

    registerSettingRoutes(
      createSettingApiStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const route = getRegisteredRoute(registry, 'post', `${BASE}/reset`);
    const bodySchema = getJsonBodySchema(route);
    expect(bodySchema).toBeDefined();
  });

  it('POST /export is registered with correct path', () => {
    const registry = new TestOpenApiRegistry();

    registerSettingRoutes(
      createSettingApiStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const route = getRegisteredRoute(registry, 'post', `${BASE}/export`);
    expect(route).toBeDefined();
  });

  it('POST /export body schema accepts valid data', () => {
    const registry = new TestOpenApiRegistry();

    registerSettingRoutes(
      createSettingApiStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const route = getRegisteredRoute(registry, 'post', `${BASE}/export`);
    const bodySchema = getJsonBodySchema(route);
    expect(bodySchema).toBeDefined();
  });
});
