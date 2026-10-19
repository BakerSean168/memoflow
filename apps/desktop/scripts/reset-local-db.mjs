#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { resolveStorageRoots } from './user-data-paths.mjs';

const DB_FILE = 'powersync.sqlite';
const PROFILES_DIR_NAME = 'profiles';

function collectDbCandidates() {
  const dirs = resolveStorageRoots().map((roots) => roots.dataRoot);
  const files = [];

  for (const userDataDir of dirs) {
    const profilesDir = path.join(userDataDir, PROFILES_DIR_NAME);
    if (!fs.existsSync(profilesDir)) {
      continue;
    }

    for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const primary = path.join(profilesDir, entry.name, 'db', DB_FILE);
      files.push(primary, `${primary}-wal`, `${primary}-shm`);
    }
  }

  return [...new Set(files)];
}

function removeIfExists(filePath, dryRun) {
  if (!fs.existsSync(filePath)) {
    return { path: filePath, status: 'missing' };
  }

  if (dryRun) {
    return { path: filePath, status: 'would_remove' };
  }

  fs.rmSync(filePath, { force: true });
  return { path: filePath, status: 'removed' };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');

  const candidates = collectDbCandidates();
  const results = candidates.map((p) => removeIfExists(p, dryRun));

  console.log(`[db-reset] mode=${dryRun ? 'dry-run' : 'apply'}`);
  for (const r of results) {
    console.log(`[db-reset] ${r.status}: ${r.path}`);
  }

  const affected = results.filter(
    (r) => r.status === 'removed' || r.status === 'would_remove',
  ).length;
  console.log(`[db-reset] done, affected files: ${affected}`);

  if (affected === 0) {
    console.log('[db-reset] no local DB files found in default userData locations');
  }
}

main();
