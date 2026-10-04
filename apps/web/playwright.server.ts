import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { expand } from 'dotenv-expand';
import { normalizeOrigin } from './e2e/helpers/normalize-origin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKSPACE_ROOT = resolve(__dirname, '../..');
const VITE_BIN_PATH = resolve(WORKSPACE_ROOT, 'node_modules/vite/bin/vite.js');
const DEFAULT_API_ORIGIN = 'http://localhost:3000';
const DEFAULT_WEB_ORIGIN = 'http://127.0.0.1:5173';
const LEGACY_LOCALHOST_WEB_ORIGIN = 'http://localhost:5173';
const DEFAULT_OPENAI_MOCK_PORT = '58102';
const DEFAULT_AI_PROVIDER_ENCRYPTION_KEY = 'e2e-ai-provider-encryption-key-32-bytes';

function quoteShellArgument(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function loadEnvFile(filePath: string): void {
  if (existsSync(filePath)) {
    expand(config({ path: filePath, override: true }));
  }
}

export function loadE2EEnv(): void {
  const preservedEntries = new Map<string, string>();
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      preservedEntries.set(key, value);
    }
  }

  process.env.NODE_ENV = 'test';

  const envFiles = [
    resolve(WORKSPACE_ROOT, '.env'),
    resolve(WORKSPACE_ROOT, '.env.local'),
    // Mode-specific files must win over generic local development values.
    // Otherwise a developer's Docker ports or blank DATABASE_URL can leak
    // into the isolated Playwright lane.
    resolve(WORKSPACE_ROOT, '.env.test'),
    resolve(WORKSPACE_ROOT, '.env.test.local'),
  ];

  for (const filePath of envFiles) {
    loadEnvFile(filePath);
  }

  for (const [key, value] of preservedEntries) {
    process.env[key] = value;
  }

  process.env.NODE_ENV = 'test';
}

loadE2EEnv();

process.env.AI_PROVIDER_ENCRYPTION_KEY ??= DEFAULT_AI_PROVIDER_ENCRYPTION_KEY;

/** Residual 1027: normalizeOrigin sole imported from e2e/helpers. */

function getApiOrigin(): string {
  const apiOrigin = normalizeOrigin(process.env.E2E_API_BASE_URL ?? DEFAULT_API_ORIGIN);

  process.env.E2E_API_BASE_URL ??= apiOrigin;
  process.env.E2E_API_FULL_URL ??= `${apiOrigin}/api/v1`;

  return apiOrigin;
}

export function getE2EWebOrigin(): string {
  return normalizeOrigin(process.env.E2E_WEB_BASE_URL ?? DEFAULT_WEB_ORIGIN);
}

export function getE2EOpenAIMockOrigin(): string {
  const port = process.env.E2E_OPENAI_MOCK_PORT?.trim() || DEFAULT_OPENAI_MOCK_PORT;
  return `http://127.0.0.1:${port}`;
}

function getWebServerRuntimeConfig() {
  const webOrigin = getE2EWebOrigin();
  const webUrl = new URL(webOrigin);

  return {
    origin: webOrigin,
    host: webUrl.hostname,
    port: webUrl.port || '80',
  };
}

/**
 * Residual 1189 keep-boundary: Playwright getCorsOrigins — E2E joined CORS string.
 * Unions E2E web origin + legacy localhost + env CORS_ORIGIN; returns comma-joined string.
 * Soft residual 1189: API getCorsOrigins is env-only string[] (no force-merge).
 */
function getCorsOrigins(): string {
  const configuredOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...new Set([getE2EWebOrigin(), LEGACY_LOCALHOST_WEB_ORIGIN, ...configuredOrigins])].join(
    ',',
  );
}

/**
 * Playwright must not silently reuse Docker/host-dev servers.
 * Opt in only with E2E_REUSE_SERVERS=1 (and never on CI).
 */
function shouldReuseApiServer(): boolean {
  if (process.env.CI) {
    return false;
  }
  return process.env.E2E_REUSE_SERVERS === '1';
}

function shouldReuseWebServer(): boolean {
  if (process.env.CI) {
    return false;
  }
  return process.env.E2E_REUSE_SERVERS === '1';
}

const apiServerOptions = {
  reuseExistingServer: shouldReuseApiServer(),
  timeout: 300 * 1000,
} as const;

const webServerOptions = {
  reuseExistingServer: shouldReuseWebServer(),
  timeout: 300 * 1000,
} as const;

export function createApiServer() {
  const apiOrigin = getApiOrigin();

  return {
    // Ensure the local test database is ready before booting the built API entrypoint.
    // Probe + RUNTIME_LANE=e2e happen inside start-api-server.ts so wrong owners fail loudly.
    command: 'corepack pnpm exec tsx ./e2e/helpers/start-api-server.ts',
    cwd: '.',
    url: `${apiOrigin}/healthz`,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      RUNTIME_LANE: 'e2e',
      // Keep the isolated host-E2E auth transaction on the same API/Web pair even
      // when a machine .env.local points Docker validation at a MagicDNS origin.
      AUTH_BASE_URL: `${apiOrigin}/api/auth`,
      MEMOFLOW_WEB_URL: getE2EWebOrigin(),
      CORS_ORIGIN: getCorsOrigins(),
    },
    ...apiServerOptions,
  };
}

/**
 * Real-provider OAuth acceptance must run against the canonical host-dev runtime
 * that owns the registered MemoFlow Dev Test callback. Starting a second
 * localhost API would create OAuth state in one process while GitHub returns the
 * callback to another process.
 *
 * The browser test therefore needs only the public host-dev origin; server
 * credentials remain owned by the machine-scoped host-dev launcher.
 */
export function getRealOAuthHostDevOrigin(): string {
  const explicit = process.env.E2E_REAL_OAUTH_WEB_ORIGIN?.trim() ?? '';
  if (!explicit && !(process.env.MEMOFLOW_WEB_URL?.trim() ?? '')) {
    loadEnvFile(resolve(WORKSPACE_ROOT, '.env.development.local'));
  }

  const configured =
    explicit || process.env.MEMOFLOW_WEB_URL?.trim() || process.env.E2E_WEB_BASE_URL?.trim() || '';

  if (!configured) {
    throw new Error(
      'Real OAuth acceptance requires canonical host-dev ingress. Run pnpm dev:host first or set E2E_REAL_OAUTH_WEB_ORIGIN.',
    );
  }

  const origin = normalizeOrigin(configured);
  if (!origin.startsWith('https://')) {
    throw new Error(
      `Real OAuth acceptance requires the HTTPS host-dev origin, received: ${origin}`,
    );
  }

  process.env.E2E_REAL_OAUTH_WEB_ORIGIN = origin;
  process.env.E2E_WEB_BASE_URL = origin;
  // Host-dev Web owns the browser boundary and proxies /api to its API.
  process.env.E2E_API_BASE_URL = origin;
  process.env.E2E_API_FULL_URL = `${origin}/api/v1`;
  return origin;
}

/**
 * Playwright config modules are also loaded by the test inventory collector.
 * Discovery must be side-effect free and must not require machine credentials
 * or a live host-dev ingress. Actual real-provider execution stays fail-closed
 * through getRealOAuthHostDevOrigin().
 */
export function getRealOAuthPlaywrightBaseURL(): string {
  if (process.env.TEST_INVENTORY_LIST === '1') {
    return 'https://real-oauth-inventory.invalid';
  }
  return getRealOAuthHostDevOrigin();
}

export function createPowerSyncTestServer() {
  const port = process.env.TEST_POWERSYNC_PORT ?? '58082';

  return {
    command: 'corepack pnpm exec tsx ./e2e/helpers/start-powersync-test-service.ts',
    cwd: '.',
    url: `http://127.0.0.1:${port}/probes/liveness`,
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
    // The Docker service intentionally survives a Playwright process so a
    // focused rerun can reuse the same isolated endpoint. The setup command
    // still starts and validates it from scratch when the port is absent.
    reuseExistingServer: true,
    timeout: 180 * 1000,
  };
}

export function createWebServer(url = `${getE2EWebOrigin()}/auth`) {
  const apiOrigin = getApiOrigin();
  const webServer = getWebServerRuntimeConfig();

  return {
    // Call the Vite entrypoint through the current Node binary so Playwright can
    // tear the dev server down cleanly on Windows without leaving a pnpm/cmd tree behind.
    command: `${quoteShellArgument(process.execPath)} ${quoteShellArgument(VITE_BIN_PATH)} --config vite.config.ts --host ${webServer.host} --port ${webServer.port} --strictPort`,
    cwd: '.',
    url,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PROXY_TARGET_URL: apiOrigin,
    },
    ...webServerOptions,
  };
}

export function createOpenAICompatibleMockServer() {
  const origin = getE2EOpenAIMockOrigin();
  return {
    command: 'corepack pnpm exec tsx ./e2e/helpers/start-openai-compatible-mock.ts',
    cwd: '.',
    url: `${origin}/healthz`,
    env: {
      ...process.env,
      E2E_OPENAI_MOCK_PORT: new URL(origin).port,
    },
    reuseExistingServer: false,
    timeout: 60 * 1000,
  };
}

export { DEFAULT_API_ORIGIN as defaultApiOrigin };
