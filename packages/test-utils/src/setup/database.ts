/**
 * Test database lifecycle management
 *
 * Provides utilities for managing the Docker-based test PostgreSQL database:
 * - Starting/stopping the test container
 * - Waiting for database readiness
 * - Syncing Prisma schema
 * - Cleaning data between tests
 *
 * Used by globalSetup.ts and individual integration test files.
 *
 * @example
 * ```typescript
 * // In globalSetup.ts:
 * import { ensureTestDatabase, syncPrismaSchema } from '@memoflow/test-utils/setup/database';
 *
 * export default async function globalSetup() {
 *   await ensureTestDatabase();
 *   syncPrismaSchema();
 * }
 *
 * // In integration test files:
 * import { cleanAllTables, getTestDatabaseUrl } from '@memoflow/test-utils/setup/database';
 *
 * beforeEach(async () => {
 *   await cleanAllTables();
 * });
 * ```
 */

import { execFileSync } from 'node:child_process';
import { accessSync } from 'node:fs';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import { Client } from 'pg';

// ─── Constants ──────────────────────────────────────────────────────

export const DEFAULT_TEST_DB_USER = 'test_user';
export const DEFAULT_TEST_DB_PASS = 'test_pass';
export const DEFAULT_TEST_DB_NAME = 'memoflow_test';
export const DEFAULT_TEST_DB_HOST = '127.0.0.1';
export const DEFAULT_TEST_DB_PORT = 5433;
export const DEFAULT_TEST_DB_CONTAINER = 'MemoFlow-test-db';

const TEST_DB_USER = process.env.TEST_DB_USER ?? DEFAULT_TEST_DB_USER;
const TEST_DB_PASS = process.env.TEST_DB_PASS ?? DEFAULT_TEST_DB_PASS;
const TEST_DB_NAME = process.env.TEST_DB_NAME ?? DEFAULT_TEST_DB_NAME;
const TEST_DB_HOST = process.env.TEST_DB_HOST ?? DEFAULT_TEST_DB_HOST;
const TEST_DB_PORT = Number(process.env.TEST_DB_PORT ?? String(DEFAULT_TEST_DB_PORT));
const TEST_DB_CONTAINER = process.env.TEST_DB_CONTAINER ?? DEFAULT_TEST_DB_CONTAINER;
const LEGACY_TEST_COMPOSE_FILE = 'docker-compose.test.yml';
const WORKSPACE_COMPOSE_FILE = 'docker-compose.yml';
const TEST_COMPOSE_SERVICE = 'postgres-test';
const DEFAULT_TEST_DATABASE_URL = `postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@${TEST_DB_HOST}:${TEST_DB_PORT}/${TEST_DB_NAME}`;

/**
 * The test database URL. Set this in process.env.DATABASE_URL before
 * running Prisma or connecting to the database.
 */
export const TEST_DATABASE_URL = DEFAULT_TEST_DATABASE_URL;

export function createIntegrationTestEnv(): Record<string, string> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;

  return {
    NODE_ENV: 'test',
    TEST_DB_HOST: process.env.TEST_DB_HOST ?? DEFAULT_TEST_DB_HOST,
    TEST_DB_PORT: process.env.TEST_DB_PORT ?? String(DEFAULT_TEST_DB_PORT),
    TEST_DB_NAME: process.env.TEST_DB_NAME ?? DEFAULT_TEST_DB_NAME,
    TEST_DB_USER: process.env.TEST_DB_USER ?? DEFAULT_TEST_DB_USER,
    TEST_DB_PASS: process.env.TEST_DB_PASS ?? DEFAULT_TEST_DB_PASS,
    TEST_DB_CONTAINER: process.env.TEST_DB_CONTAINER ?? DEFAULT_TEST_DB_CONTAINER,
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? testDatabaseUrl,
    DATABASE_URL: testDatabaseUrl,
  };
}

// ─── Docker Container Management ────────────────────────────────────

/**
 * Check if the test database container is running.
 */
export function isContainerRunning(): boolean {
  try {
    const result = execFileSync(
      'docker',
      ['inspect', '-f', '{{.State.Running}}', TEST_DB_CONTAINER],
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return result.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Start the test database container using docker-compose.
 * If the container is already running, this is a no-op.
 *
 * @param projectRoot - Path to the monorepo root
 */
export function startTestContainer(projectRoot?: string): void {
  if (isContainerRunning()) {
    console.log('[test-utils] Test database container already running');
    return;
  }

  console.log('[test-utils] Starting test database container...');
  const root = projectRoot ?? findProjectRoot();
  const composeConfig = resolveComposeConfig(root);

  execFileSync('docker', [...composeConfig.args, 'up', '-d', '--wait', ...composeConfig.services], {
    cwd: root,
    stdio: 'inherit',
  });

  console.log('[test-utils] Test database container started');
}

/**
 * Stop and remove the test database container.
 */
export function stopTestContainer(projectRoot?: string): void {
  if (!isContainerRunning()) return;

  console.log('[test-utils] Stopping test database container...');
  const root = projectRoot ?? findProjectRoot();
  const composeConfig = resolveComposeConfig(root);

  execFileSync('docker', [...composeConfig.args, 'stop', ...composeConfig.services], {
    cwd: root,
    stdio: 'inherit',
  });
}

/**
 * Wait for PostgreSQL to be ready to accept connections.
 *
 * @param timeoutMs - Maximum time to wait (default 30s)
 * @throws Error if database is not ready within timeout
 */
export async function waitForDatabase(timeoutMs = 30_000): Promise<void> {
  const startedAt = Date.now();
  const { hostname, port } = getTestDatabaseConnectionInfo();

  while (Date.now() - startedAt < timeoutMs) {
    if (await canConnectToPort(hostname, port)) {
      return;
    }

    await sleep(500);
  }

  throw new Error(`[test-utils] Database not ready after ${timeoutMs}ms`);
}

// ─── Prisma Schema Management ──────────────────────────────────────

/**
 * Sync the Prisma schema to the test database.
 * Uses `prisma db push --skip-generate --accept-data-loss` for speed.
 *
 * Prisma 7 uses prisma.config.ts in packages/database/prisma/ which reads
 * DATABASE_URL from env. We pass the test DB URL via environment variable.
 *
 * @param prismaDir - Path to the directory containing prisma.config.ts
 */
export function syncPrismaSchema(prismaDir?: string): void {
  console.log('[test-utils] Syncing Prisma schema to test database...');

  const root = findProjectRoot();
  const dir = prismaDir ?? resolve(root, 'packages/database/prisma');
  const prismaCli = resolve(root, 'node_modules/prisma/build/index.js');

  // Prisma 7 removed --skip-generate; only --accept-data-loss remains
  execFileSync(process.execPath, [prismaCli, 'db', 'push', '--accept-data-loss'], {
    cwd: dir,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: getTestDatabaseUrl(),
      PRISMA_HIDE_UPDATE_MESSAGE: 'true',
    },
  });

  console.log('[test-utils] Prisma schema synced');
}

/**
 * Install database extensions required by the Prisma schema before db push.
 * PostgreSQL images expose extension binaries but do not enable extensions in
 * every newly-created database automatically.
 */
export async function prepareTestDatabaseExtensions(): Promise<void> {
  const client = new Client({ connectionString: getTestDatabaseUrl() });

  await client.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
  } finally {
    await client.end();
  }
}

// ─── High-Level Setup ──────────────────────────────────────────────

/**
 * Ensure the test database is running and schema is up-to-date.
 * This is the main entry point for globalSetup.ts.
 *
 * Steps:
 * 1. Start Docker container (if not running) — skipped in CI where DB is a service container
 * 2. Wait for PostgreSQL readiness
 * 3. Set environment variables
 * 4. Sync Prisma schema
 */
export async function ensureTestDatabase(projectRoot?: string): Promise<void> {
  const root = projectRoot ?? findProjectRoot();
  const isCI = process.env.CI === 'true';
  const integrationEnv = createIntegrationTestEnv();

  // Set env vars first — Prisma needs DATABASE_URL
  for (const [key, value] of Object.entries(integrationEnv)) {
    process.env[key] = value;
  }
  process.env.JWT_SECRET = 'test-jwt-secret-not-for-production';
  process.env.PRISMA_HIDE_UPDATE_MESSAGE = 'true';

  if (isCI) {
    console.log('[test-utils] CI detected — skipping Docker container management');
  } else {
    const { hostname, port } = getTestDatabaseConnectionInfo();
    const databaseAlreadyReachable = await canConnectToPort(hostname, port);

    if (databaseAlreadyReachable) {
      console.log('[test-utils] Test database already reachable — skipping Docker startup');
    } else {
      startTestContainer(root);
    }
  }

  await waitForDatabase();
  await prepareTestDatabaseExtensions();
  syncPrismaSchema(resolve(root, 'packages/database/prisma'));
}

/**
 * Get the test database URL. Convenience for tests that need the URL.
 */
export function getTestDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
}

// ─── Data Cleanup ──────────────────────────────────────────────────

/**
 * Truncate all tables in the test database.
 * Uses TRUNCATE ... CASCADE for speed.
 *
 * Call this in beforeEach() for integration tests to ensure a clean state.
 *
 * @param prisma - PrismaClient instance (to avoid importing @prisma/client here)
 */
export async function cleanAllTables(prisma: {
  $executeRawUnsafe: (query: string) => Promise<number>;
  $queryRawUnsafe: (query: string) => Promise<unknown[]>;
}): Promise<void> {
  const tables = (await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'`,
  )) as Array<{ tablename: string }>;

  if (tables.length === 0) return;

  const tableNames = tables.map((t) => `"${t.tablename}"`).join(', ');
  const statement = `TRUNCATE TABLE ${tableNames} CASCADE`;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await prisma.$executeRawUnsafe(statement);
      return;
    } catch (error) {
      if (!isPostgresDeadlock(error) || attempt === 3) throw error;
      await sleep(25 * attempt);
    }
  }
}

// ─── Internal Helpers ──────────────────────────────────────────────

function isPostgresDeadlock(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    code?: unknown;
    meta?: { code?: unknown };
  };
  return candidate.code === '40P01' || candidate.meta?.code === '40P01';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTestDatabaseConnectionInfo(): { hostname: string; port: number } {
  const url = new URL(getTestDatabaseUrl());
  return {
    hostname: url.hostname,
    port: url.port ? Number(url.port) : 5432,
  };
}

function canConnectToPort(hostname: string, port: number, timeoutMs = 1_000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const socket = createConnection({ host: hostname, port });

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

/**
 * Find the monorepo root by looking for Nx / pnpm workspace markers
 * walking up from the current working directory.
 */
function findProjectRoot(): string {
  let dir = process.cwd();

  // Walk up to find the monorepo root (max 10 levels)
  for (let i = 0; i < 10; i++) {
    try {
      accessSync(resolve(dir, 'nx.json'));
      accessSync(resolve(dir, 'pnpm-workspace.yaml'));
      return dir;
    } catch {
      dir = resolve(dir, '..');
    }
  }

  // Fallback: assume cwd is the root
  return process.cwd();
}

type ComposeConfig = {
  args: string[];
  services: string[];
};

function resolveComposeConfig(projectRoot: string): ComposeConfig {
  const legacyComposeFile = resolve(projectRoot, LEGACY_TEST_COMPOSE_FILE);
  try {
    accessSync(legacyComposeFile);
    return {
      args: ['compose', '-f', LEGACY_TEST_COMPOSE_FILE],
      services: [],
    };
  } catch {
    // Fall through to the profile-based workspace compose file.
  }

  const workspaceComposeFile = resolve(projectRoot, WORKSPACE_COMPOSE_FILE);
  try {
    accessSync(workspaceComposeFile);
    return {
      args: ['compose', '-f', WORKSPACE_COMPOSE_FILE, '--profile', 'test'],
      services: [TEST_COMPOSE_SERVICE],
    };
  } catch {
    throw new Error(
      `[test-utils] No test compose file found. Expected ${LEGACY_TEST_COMPOSE_FILE} or ${WORKSPACE_COMPOSE_FILE} in ${projectRoot}.`,
    );
  }
}
