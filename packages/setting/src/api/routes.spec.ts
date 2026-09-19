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
  registerPath(route: Record<string, unknown>): void { this.paths.push(route as RegisteredRoute); }
  register(): void {}
}

const auth = ((_, __, next) => next()) as RequestHandler;

function apiStub(): SettingApplicationPort {
  return {
    getPreferenceProfile: vi.fn(),
    getPreferenceNamespace: vi.fn(),
    patchPreferenceNamespace: vi.fn(),
    resetPreferenceNamespace: vi.fn(),
    resetUserPreferences: vi.fn(),
    exportSettings: vi.fn(),
    importSettings: vi.fn(),
  };
}

function register() {
  const registry = new TestOpenApiRegistry();
  registerSettingRoutes(apiStub(), { auth, requireRole: vi.fn(() => auth) }, registry);
  return registry;
}

function route(registry: TestOpenApiRegistry, method: string, path: string): RegisteredRoute {
  const found = registry.paths.find((candidate) => candidate.method === method && candidate.path === path);
  expect(found, `${method.toUpperCase()} ${path}`).toBeDefined();
  return found!;
}

function bodySchema(registered: RegisteredRoute): { safeParse(value: unknown): { success: boolean } } {
  return (((registered.request?.body as Record<string, unknown>)?.content as Record<string, unknown>)?.[
    'application/json'
  ] as { schema: { safeParse(value: unknown): { success: boolean } } }).schema;
}

const BASE = '/api/v1/settings';

describe('canonical Setting HTTP routes', () => {
  it('registers only namespace preferences plus V3 import/export', () => {
    const registry = register();
    const surfaces = registry.paths.map(({ method, path }) => `${method.toUpperCase()} ${path}`).sort();

    expect(surfaces).toEqual([
      `GET ${BASE}/preferences`,
      `GET ${BASE}/preferences/{namespace}`,
      `PATCH ${BASE}/preferences/{namespace}`,
      `POST ${BASE}/export`,
      `POST ${BASE}/import`,
      `POST ${BASE}/preferences/reset-all`,
      `POST ${BASE}/preferences/{namespace}/reset`,
    ].sort());
    expect(surfaces).not.toContain(`GET ${BASE}`);
    expect(surfaces).not.toContain(`POST ${BASE}/reset`);
    expect(surfaces.some((entry) => entry.includes('{category}'))).toBe(false);
  });

  it('keeps canonical PATCH strict and conflict-aware', () => {
    const registered = route(register(), 'patch', `${BASE}/preferences/{namespace}`);
    const body = bodySchema(registered);
    expect(body.safeParse({ patch: { theme: 'dark' }, expectedRevision: 2 }).success).toBe(true);
    expect(body.safeParse({ patch: { theme: 'dark' }, unexpected: true }).success).toBe(false);
    expect(registered.responses).toHaveProperty('409');
  });

  it('keeps reset-all on canonical namespace revisions', () => {
    const registered = route(register(), 'post', `${BASE}/preferences/reset-all`);
    const body = bodySchema(registered);
    expect(body.safeParse({ expectedRevisions: { presentation: 2, regional: 5 } }).success).toBe(true);
    expect(body.safeParse({ category: 'appearance' }).success).toBe(false);
  });

  it('accepts V3 import as JSON text only and has no legacy overwrite switch', () => {
    const body = bodySchema(route(register(), 'post', `${BASE}/import`));
    expect(body.safeParse({ data: '{"schemaVersion":3}' }).success).toBe(true);
    expect(body.safeParse({ data: '{"schemaVersion":3}', overwrite: true }).success).toBe(false);
    expect(body.safeParse({ data: { schemaVersion: 3 } }).success).toBe(false);
  });

  it('keeps export request empty/strict', () => {
    const body = bodySchema(route(register(), 'post', `${BASE}/export`));
    expect(body.safeParse({}).success).toBe(true);
    expect(body.safeParse({ format: 'csv' }).success).toBe(false);
  });
});
