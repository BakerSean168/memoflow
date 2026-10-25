#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalComposeRuntimeEnv, localComposeArgs } from '../docker/local-compose.mjs';
import {
  buildCleanupExecArgs,
  buildCleanupPreviewSql,
  buildCleanupSql,
  DEFAULT_PM_CLEANUP_PREFIX,
  normalizeCleanupPrefix,
} from './local-docker-pm-cleanup.mjs';

function parseArgs(argv) {
  const options = {
    apply: false,
    prefix: DEFAULT_PM_CLEANUP_PREFIX,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--apply') {
      options.apply = true;
      continue;
    }
    if (value === '--prefix') {
      options.prefix = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }

  options.prefix = normalizeCleanupPrefix(options.prefix);
  return options;
}

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(workspaceRoot);
const options = parseArgs(process.argv.slice(2));
const env = createLocalComposeRuntimeEnv({ quiet: true });
const sql = options.apply
  ? buildCleanupSql(options.prefix)
  : buildCleanupPreviewSql(options.prefix);
const result = spawnSync('docker', [...localComposeArgs, ...buildCleanupExecArgs(sql)], {
  cwd: workspaceRoot,
  env,
  encoding: 'utf8',
  stdio: 'inherit',
});

if (result.error) throw result.error;
if (!options.apply) {
  console.log(
    `[pm-cleanup] preview only for prefix "${options.prefix}". Rerun with --apply to delete these local Docker identities and their cascaded product data.`,
  );
}
process.exit(result.status ?? 1);
