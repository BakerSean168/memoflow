import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = resolve(__dirname, '../../..');

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  resetEnv();
  vi.resetModules();
});

describe('playwright.server', () => {
  it('loads test env values into child processes', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DB_HOST;
    delete process.env.NODE_ENV;

    const { createApiServer, createWebServer } = await import('../playwright.server');

    const apiServer = createApiServer();
    const webServer = createWebServer();

    expect(process.env.NODE_ENV).toBe('test');
    expect(apiServer.env?.NODE_ENV).toBe('test');
    expect(webServer.env?.NODE_ENV).toBe('test');
    expect(apiServer.env?.DATABASE_URL).toBe(
      'postgresql://test_user:test_pass@127.0.0.1:5433/memoflow_test',
    );
    expect(webServer.env?.DATABASE_URL).toBe(
      'postgresql://test_user:test_pass@127.0.0.1:5433/memoflow_test',
    );
  });

  it('injects the default web origin into API CORS config', async () => {
    delete process.env.E2E_API_BASE_URL;
    delete process.env.E2E_WEB_BASE_URL;
    delete process.env.E2E_API_FULL_URL;
    delete process.env.CORS_ORIGIN;

    const { createApiServer } = await import('../playwright.server');

    const server = createApiServer();

    expect(server.url).toBe('http://localhost:3000/healthz');
    expect(server.env?.CORS_ORIGIN).toBe('http://127.0.0.1:5173,http://localhost:5173');
    expect(process.env.E2E_API_BASE_URL).toBe('http://localhost:3000');
    expect(process.env.E2E_API_FULL_URL).toBe('http://localhost:3000/api/v1');
  });

  it('isolates API canonical auth and web URLs from machine-local Docker origins', async () => {
    process.env.AUTH_BASE_URL = 'http://gcp-dev-01.example.ts.net:53080/api/auth';
    process.env.MEMOFLOW_WEB_URL = 'http://gcp-dev-01.example.ts.net:58080';
    process.env.E2E_API_BASE_URL = 'http://localhost:3000';
    process.env.E2E_WEB_BASE_URL = 'http://127.0.0.1:5173';

    const { createApiServer } = await import('../playwright.server');
    const apiServer = createApiServer();

    expect(apiServer.env?.AUTH_BASE_URL).toBe('http://localhost:3000/api/auth');
    expect(apiServer.env?.MEMOFLOW_WEB_URL).toBe('http://127.0.0.1:5173');
  });

  it('uses overridden E2E origins for both API and web servers', async () => {
    process.env.E2E_API_BASE_URL = 'http://127.0.0.1:3001/';
    process.env.E2E_WEB_BASE_URL = 'http://localhost:4173/';
    delete process.env.E2E_API_FULL_URL;
    delete process.env.CORS_ORIGIN;

    const { createApiServer, createWebServer, getE2EWebOrigin } =
      await import('../playwright.server');

    const apiServer = createApiServer();
    const webServer = createWebServer();

    expect(apiServer.url).toBe('http://127.0.0.1:3001/healthz');
    expect(apiServer.env?.CORS_ORIGIN).toBe(
      'http://localhost:4173,http://localhost:5173,http://127.0.0.1:5173',
    );
    expect(webServer.url).toBe('http://localhost:4173/auth');
    expect(getE2EWebOrigin()).toBe('http://localhost:4173');
    expect(webServer.command).toBe(
      `"${process.execPath}" "${resolve(workspaceRoot, 'node_modules/vite/bin/vite.js')}" --config vite.config.ts --host localhost --port 4173 --strictPort`,
    );
    expect(webServer.env?.PROXY_TARGET_URL).toBe('http://127.0.0.1:3001');
    expect(process.env.E2E_API_FULL_URL).toBe('http://127.0.0.1:3001/api/v1');
  });

  it('preserves existing CORS origins while appending E2E web origins', async () => {
    process.env.E2E_WEB_BASE_URL = 'http://127.0.0.1:5173';
    process.env.CORS_ORIGIN = 'https://app.example.com,http://localhost:5173';

    const { createApiServer } = await import('../playwright.server');

    const apiServer = createApiServer();

    expect(apiServer.env?.CORS_ORIGIN).toBe(
      'http://127.0.0.1:5173,http://localhost:5173,https://app.example.com',
    );
  });

  it('uses an explicit OpenAI mock port instead of relying on the fixed default', async () => {
    process.env.E2E_OPENAI_MOCK_PORT = '59234';

    const { createOpenAICompatibleMockServer, getE2EOpenAIMockOrigin } =
      await import('../playwright.server');

    const mockServer = createOpenAICompatibleMockServer();
    expect(getE2EOpenAIMockOrigin()).toBe('http://127.0.0.1:59234');
    expect(mockServer.url).toBe('http://127.0.0.1:59234/healthz');
    expect(mockServer.env?.E2E_OPENAI_MOCK_PORT).toBe('59234');
  });

  it('starts fresh API and web servers by default', async () => {
    delete process.env.CI;
    delete process.env.E2E_REUSE_SERVERS;

    const { createApiServer, createWebServer } = await import('../playwright.server');

    expect(createApiServer().reuseExistingServer).toBe(false);
    expect(createWebServer().reuseExistingServer).toBe(false);
  });

  it('reuses API and web servers only after an explicit local opt-in', async () => {
    delete process.env.CI;
    process.env.E2E_REUSE_SERVERS = '1';

    const { createApiServer, createWebServer } = await import('../playwright.server');

    expect(createApiServer().reuseExistingServer).toBe(true);
    expect(createWebServer().reuseExistingServer).toBe(true);
  });

  it('never reuses API or web servers on CI', async () => {
    process.env.CI = '1';
    process.env.E2E_REUSE_SERVERS = '1';

    const { createApiServer, createWebServer } = await import('../playwright.server');

    expect(createApiServer().reuseExistingServer).toBe(false);
    expect(createWebServer().reuseExistingServer).toBe(false);
  });

  it('real OAuth acceptance targets the canonical HTTPS host-dev runtime', async () => {
    process.env.E2E_REAL_OAUTH_WEB_ORIGIN = 'https://gcp-dev.example.ts.net:20220/';

    const { createApiServer, getRealOAuthHostDevOrigin } = await import('../playwright.server');

    const mockLane = createApiServer();
    expect(mockLane.env?.RUNTIME_LANE).toBe('e2e');

    expect(getRealOAuthHostDevOrigin()).toBe('https://gcp-dev.example.ts.net:20220');
    expect(process.env.E2E_WEB_BASE_URL).toBe('https://gcp-dev.example.ts.net:20220');
    expect(process.env.E2E_API_BASE_URL).toBe('https://gcp-dev.example.ts.net:20220');
    expect(process.env.E2E_API_FULL_URL).toBe('https://gcp-dev.example.ts.net:20220/api/v1');
  });

  it('rejects non-HTTPS origins for real OAuth acceptance', async () => {
    process.env.E2E_REAL_OAUTH_WEB_ORIGIN = 'http://127.0.0.1:5173';

    const { getRealOAuthHostDevOrigin } = await import('../playwright.server');

    expect(() => getRealOAuthHostDevOrigin()).toThrow(
      'Real OAuth acceptance requires the HTTPS host-dev origin',
    );
  });

  it('keeps Playwright inventory discovery side-effect free without weakening real OAuth execution', async () => {
    process.env.TEST_INVENTORY_LIST = '1';
    process.env.MEMOFLOW_WEB_URL = 'http://127.0.0.1:4173';
    process.env.E2E_WEB_BASE_URL = 'http://127.0.0.1:4173';
    delete process.env.E2E_REAL_OAUTH_WEB_ORIGIN;

    const { getRealOAuthPlaywrightBaseURL, getRealOAuthHostDevOrigin } =
      await import('../playwright.server');

    expect(getRealOAuthPlaywrightBaseURL()).toBe('https://real-oauth-inventory.invalid');
    expect(() => getRealOAuthHostDevOrigin()).toThrow(
      'Real OAuth acceptance requires the HTTPS host-dev origin',
    );
  });
});
