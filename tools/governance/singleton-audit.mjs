#!/usr/bin/env node

/**
 * Singleton Pattern Audit
 *
 * Scans packages for `getOccurrence()` usage to detect singleton/service-locator
 * patterns that should be replaced with explicit composition root injection.
 *
 * Existing singletons are allowlisted; this audit catches new introductions.
 *
 * Exit codes:
 *   0 - No new singleton patterns found
 *   1 - New singleton patterns detected
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.nx',
  '__tests__', '__mocks__', 'test', 'tests', 'e2e',
  'generated', 'locales',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

// Known singletons that are allowlisted (to be phased out over time).
// Format: relative path from repo root (forward slashes)
const ALLOWLIST = new Set([
  // InitializationManager - will be replaced by startup hook seam (Batch 2.5)
  'packages/utils/src/initialization-manager.ts',
  'packages/utils/src/web-initialization-manager.ts',
  'packages/utils/src/domain/global-event-bus.ts',
  // Feature initialization files - will be migrated to explicit hooks
  'packages/notification/src/api/initialization.ts',
  'packages/app-vue/src/modules/notification/initialization/index.ts',
  'packages/app-vue/src/modules/goal/initialization/index.ts',
  'packages/goal/src/api/initialization.ts',

]);

const errors = [];

// Only scan packages (not apps - apps are runtime containers that may
// legitimately manage singletons during transition)
const packagesDir = path.join(ROOT, 'packages');
walkDir(packagesDir, 'packages');

if (errors.length > 0) {
  console.error(`[singleton-audit] failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`  ${error}`);
  }
  process.exit(1);
} else {
  console.log('[singleton-audit] passed: no new singleton patterns in packages');
}

function walkDir(dir, relPath) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkDir(full, `${relPath}/${entry}`);
    } else if (stat.isFile()) {
      const ext = path.extname(entry);
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      const fileRel = `${relPath}/${entry}`;
      if (ALLOWLIST.has(fileRel)) continue;
      const content = readFileSync(full, 'utf-8');
      if (/\.getOccurrence\(\)/.test(content)) {
        errors.push(`${fileRel}: contains .getOccurrence() — use explicit injection instead`);
      }
    }
  }
}
