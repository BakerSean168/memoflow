/*
 * Repo-level local-docker orchestration intentionally consumes workspace tools
 * that are not publishable Nx libraries. Keep this script colocated with the
 * Playwright lane while exempting those two infrastructure imports from the
 * project-to-project module-boundary rule.
 */
/* eslint-disable @nx/enforce-module-boundaries */
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createLocalComposeRuntimeEnv,
  localComposeArgs,
  resolveLocalDockerBrowserValidationOrigins,
} from '../../../../tools/docker/local-compose.mjs';
import {
  collectBrowserProbeEvidence,
  collectLocalDockerRuntimeEvidence,
} from '../../../../tools/agent-skills/validate-local-deploy/scripts/local-docker-evidence.mjs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(currentDir, '../../../..');
const webRoot = resolve(workspaceRoot, 'apps/web');
const evidenceDir = resolve(workspaceRoot, 'reports/local-deploy-validation');
const evidencePath = resolve(evidenceDir, 'local-docker-playwright-evidence.json');

process.chdir(workspaceRoot);
const env = createLocalComposeRuntimeEnv({ quiet: true });
const validationOrigins = resolveLocalDockerBrowserValidationOrigins({
  apiHostPort: env.API_HOST_PORT,
  webHostPort: env.WEB_HOST_PORT,
  authBaseUrl: env.AUTH_BASE_URL,
  webUrl: env.MEMOFLOW_WEB_URL,
});
env.E2E_WEB_BASE_URL = validationOrigins.webOrigin;
env.E2E_API_BASE_URL = validationOrigins.apiOrigin;
env.E2E_API_FULL_URL = `${env.E2E_API_BASE_URL}/api/v1`;
env.E2E_LOCAL_DOCKER_PROBE_TOKEN = `pm-local-docker-browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const runtimeEvidence = await collectLocalDockerRuntimeEvidence({
  workspace: workspaceRoot,
  env,
  composeArgs: localComposeArgs,
});
if (!runtimeEvidence.ok) {
  console.error('[local-docker-e2e] runtime evidence failed:');
  for (const error of runtimeEvidence.errors) console.error(`  - ${error}`);
  writeEvidence({
    generatedAt: new Date().toISOString(),
    headRevision: env.VCS_REF,
    runtime: runtimeEvidence,
    browserRequest: null,
    playwrightExitCode: null,
    ok: false,
  });
  process.exit(1);
}

const playwrightCli = resolve(workspaceRoot, 'node_modules/@playwright/test/cli.js');
const startedAt = new Date(Date.now() - 1000).toISOString();
const result = spawnSync(
  process.execPath,
  [
    playwrightCli,
    'test',
    '--config',
    'playwright.local-docker.config.ts',
    ...process.argv.slice(2),
  ],
  {
    cwd: webRoot,
    env,
    stdio: 'inherit',
  },
);

if (result.error) {
  throw result.error;
}

const browserRequest = collectBrowserProbeEvidence({
  workspace: workspaceRoot,
  env,
  composeArgs: localComposeArgs,
  token: env.E2E_LOCAL_DOCKER_PROBE_TOKEN,
  since: startedAt,
});
const playwrightExitCode = result.status ?? 1;
const ok = playwrightExitCode === 0 && browserRequest.ok;
writeEvidence({
  generatedAt: new Date().toISOString(),
  headRevision: env.VCS_REF,
  runtime: runtimeEvidence,
  browserRequest,
  playwrightExitCode,
  ok,
});

if (playwrightExitCode === 0 && !browserRequest.ok) {
  console.error(
    '[local-docker-e2e] Chromium completed, but its unique request token was not found in the current web container logs.',
  );
}
process.exit(ok ? 0 : playwrightExitCode || 1);

function writeEvidence(evidence) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`[local-docker-e2e] evidence written to ${evidencePath}`);
}
