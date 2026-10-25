#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { resolveStorageRoots } from './user-data-paths.mjs';

const VALID_SCOPES = new Set(['all', 'auth', 'db']);

function collectTargets(roots, scope) {
  if (scope === 'all') {
    return ['configRoot', 'dataRoot', 'stateRoot', 'cacheRoot', 'logsDir'].map((key) => ({
      label: key,
      path: roots[key],
    }));
  }
  const data = roots.dataRoot;
  if (scope === 'auth') {
    return [
      { label: 'shared credentials', path: path.join(data, 'shared', 'secure') },
      { label: 'device identity', path: path.join(data, 'shared', 'auth') },
      ...profileTargets(data, 'auth'),
    ];
  }
  return profileTargets(data, 'db');
}

function profileTargets(dataRoot, directory) {
  const profiles = path.join(dataRoot, 'profiles');
  if (!fs.existsSync(profiles)) return [];
  return fs
    .readdirSync(profiles, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^p_[a-f0-9]{24}$/.test(entry.name))
    .map((entry) => ({ label: directory, path: path.join(profiles, entry.name, directory) }));
}

function removeTarget(target, dryRun) {
  if (!fs.existsSync(target.path)) {
    return { ...target, status: 'missing' };
  }

  if (dryRun) {
    return { ...target, status: 'would_remove' };
  }

  fs.rmSync(target.path, { recursive: true, force: true });
  return { ...target, status: 'removed' };
}

function parseScope(argv) {
  const explicitScopeArg = argv.find((arg) => arg.startsWith('--scope='));
  const explicitScope = explicitScopeArg ? explicitScopeArg.slice('--scope='.length) : null;
  const positionalScope = argv.find((arg) => !arg.startsWith('--'));
  const scope = explicitScope ?? positionalScope ?? 'all';

  if (!VALID_SCOPES.has(scope)) {
    throw new Error(`Unsupported scope: ${scope}. Expected one of: all, auth, db`);
  }

  return scope;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const scope = parseScope(args);
  const userDataDirs = resolveStorageRoots();

  console.log(`[local-data-reset] mode=${dryRun ? 'dry-run' : 'apply'} scope=${scope}`);

  let affected = 0;
  for (const roots of userDataDirs) {
    console.log(`[local-data-reset] scanning: ${roots.dataRoot}`);
    const targets = collectTargets(roots, scope);
    const results = targets.map((target) => removeTarget(target, dryRun));

    for (const result of results) {
      if (result.status === 'removed' || result.status === 'would_remove') {
        affected += 1;
      }
      console.log(`[local-data-reset] ${result.status}: ${result.path} (${result.label})`);
    }
  }

  console.log(`[local-data-reset] done, affected targets: ${affected}`);
  if (affected === 0) {
    console.log('[local-data-reset] no local desktop data found in default userData locations');
  }
}

main();
