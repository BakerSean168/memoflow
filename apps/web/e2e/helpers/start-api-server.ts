import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureTestDatabase } from '@memoflow/test-utils/setup/database';
import { createApiProcessEnv } from './api-process-env';
import { buildApiApp } from './build-api';
import { normalizeOrigin } from './normalize-origin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..');
const apiDistDir = path.resolve(workspaceRoot, 'apps', 'api', 'dist');
/** Residual 1335: API process cwd is apps/api/dist; relative LOG_DIR=logs can ENOENT under that tree. */
const apiLogDir = path.resolve(workspaceRoot, 'apps', 'api', 'logs');

const DEFAULT_API_ORIGIN = 'http://localhost:3000';

/** Residual 1027: normalizeOrigin sole imported from ./normalize-origin. */

async function probeExistingApi(apiOrigin: string): Promise<{
  occupied: boolean;
  lane?: string;
  status?: number;
  error?: string;
}> {
  try {
    const response = await fetch(`${apiOrigin}/healthz`, {
      signal: AbortSignal.timeout(1500),
    });
    let lane: string | undefined;
    try {
      const body = (await response.json()) as { lane?: string };
      if (typeof body.lane === 'string' && body.lane.trim()) {
        lane = body.lane.trim();
      }
    } catch {
      // non-JSON health body is still "something is listening"
    }
    return {
      occupied: true,
      lane,
      status: response.status,
    };
  } catch (error) {
    return {
      occupied: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const apiOrigin = normalizeOrigin(process.env.E2E_API_BASE_URL ?? DEFAULT_API_ORIGIN);
  const existing = await probeExistingApi(apiOrigin);

  if (existing.occupied) {
    const lane = existing.lane ?? '(missing)';
    console.error(
      `[playwright-api-server] ${apiOrigin} is already occupied (HTTP ${existing.status ?? '?'}, lane=${lane}).`,
    );
    if (existing.lane === 'e2e') {
      console.error(
        '[playwright-api-server] An e2e API is already running. Stop it, or set E2E_REUSE_SERVERS=1 to reuse intentionally.',
      );
    } else {
      console.error(
        '[playwright-api-server] This is almost certainly Docker local-docker or host-dev, NOT the Playwright API dist.',
      );
      console.error(
        '[playwright-api-server] Fix: free :3000 (e.g. pnpm docker:local:down if API_HOST_PORT was 3000), ensure local-docker uses 20201, then re-run e2e.',
      );
      console.error(
        '[playwright-api-server] See docs/operations/runtime.md and pnpm runtime:preflight --profile e2e',
      );
    }
    process.exit(1);
  }

  buildApiApp(workspaceRoot);
  await ensureTestDatabase(workspaceRoot);

  fs.mkdirSync(apiLogDir, { recursive: true });

  // Residual 1339: real interactive OAuth uses host-dev so getGithubOAuthConfig
  // does not force e2e-mock (residual 1333). Default Playwright stays on e2e.
  const runtimeLane =
    process.env.E2E_REAL_GITHUB_OAUTH === '1' || process.env.RUNTIME_LANE === 'host-dev'
      ? 'host-dev'
      : 'e2e';

  const apiProcess = spawn(process.execPath, ['main.js'], {
    cwd: apiDistDir,
    env: createApiProcessEnv(process.env, runtimeLane, apiLogDir),
    stdio: 'inherit',
  });

  const forwardSignal = (signal: NodeJS.Signals) => {
    if (!apiProcess.killed) {
      apiProcess.kill(signal);
    }
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  apiProcess.once('error', (error) => {
    console.error('[playwright-api-server] failed to start API process', error);
    process.exit(1);
  });

  apiProcess.once('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

void main().catch((error) => {
  console.error('[playwright-api-server] setup failed', error);
  process.exit(1);
});
