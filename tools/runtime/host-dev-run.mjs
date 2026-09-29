#!/usr/bin/env node

/**
 * Canonical host-dev launcher.
 *
 * Loads machine-scoped credentials once, then starts infra/Tailnet and Nx with
 * the same inherited environment. This keeps disposable worktrees free of
 * durable secrets while preserving hot reload.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { loadHostDevEnv } from './host-dev-env.mjs';

const workspaceRoot = resolve(import.meta.dirname, '../..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) throw result.error;
  if (result.signal) {
    process.exit(result.signal === 'SIGINT' ? 130 : 1);
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

const sharedEnv = loadHostDevEnv();
if (sharedEnv.loaded) {
  console.log(
    `[host-dev:env] loaded machine overlay: ${sharedEnv.filePath} (${sharedEnv.injectedKeys.length} inherited keys)`,
  );
  if (sharedEnv.insecurePermissions) {
    console.warn(
      `[host-dev:env] warning: ${sharedEnv.filePath} is readable by group/other users; chmod 600 is recommended`,
    );
  }
} else {
  console.warn(
    `[host-dev:env] machine overlay not found: ${sharedEnv.filePath}; optional server integrations may be unavailable`,
  );
}

if (sharedEnv.githubKnowledgeApp.partial) {
  console.warn(
    `[host-dev:env] GitHub knowledge App configuration is partial; missing: ${sharedEnv.githubKnowledgeApp.missing.join(', ')}`,
  );
} else {
  console.log(
    `[host-dev:env] GitHub knowledge App: ${sharedEnv.githubKnowledgeApp.configured ? 'configured' : 'not configured'}`,
  );
}

run(process.execPath, [resolve(workspaceRoot, 'tools/runtime/host-dev-compose.mjs'), 'up']);
run(process.execPath, [resolve(workspaceRoot, 'tools/runtime/host-dev-tailnet.mjs'), 'up']);
run(resolve(workspaceRoot, 'node_modules/.bin/nx'), [
  'run-many',
  '-t',
  'serve',
  '--projects=api,web',
  '--parallel=2',
]);
