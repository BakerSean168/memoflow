#!/usr/bin/env node

/**
 * Platform Leakage Audit
 *
 * Scans shared/UI packages for direct access to runtime-specific globals
 * like `window.electronAPI`. These packages should use injected adapters
 * instead of reaching into platform globals.
 *
 * Exit codes:
 *   0 - No platform leakage found
 *   1 - Platform leakage detected
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');

// Packages that should never access runtime-specific globals
const SHARED_PACKAGE_DIRS = [
  'packages/app-vue',
  'packages/app-react',
  'packages/contracts',
  'packages/utils',
  'packages/patterns',
  'packages/http-client',
  'packages/ipc-client',
];

// Patterns that indicate platform-specific global access
const FORBIDDEN_PATTERNS = [
  { pattern: /window\.electronAPI/g, label: 'window.electronAPI' },
  { pattern: /window\.electron\b/g, label: 'window.electron' },
];

// Known violations to be fixed in later refactoring batches.
// Format: relative path from repo root (forward slashes)
const ALLOWLIST = new Set([
  // contracts: Electron IPC channel types — will be moved to runtime-specific subpackage (Batch 5.5)
  'packages/contracts/src/result/ipc.ts',
]);

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.nx',
  '__tests__',
  '__mocks__',
  'test',
  'tests',
  'e2e',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue']);

const errors = [];

for (const pkgDir of SHARED_PACKAGE_DIRS) {
  const fullPath = path.join(ROOT, pkgDir);
  try {
    statSync(fullPath);
  } catch {
    continue; // package doesn't exist, skip
  }
  walkDir(fullPath, pkgDir);
}

if (errors.length > 0) {
  console.error(`[platform-leakage-audit] failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`  ${error}`);
  }
  process.exit(1);
} else {
  console.log('[platform-leakage-audit] passed: no platform leakage in shared packages');
}

/**
 * Strip block comments (/* ... *​/) and line comments (// ...) from source code.
 * Preserves string literals to avoid stripping content inside strings.
 */
function stripComments(source) {
  // Remove block comments (non-greedy, handles nested *​/ inside JSDoc)
  let result = source.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove line comments (but not URLs like https:// which contain //)
  result = result.replace(/(?<![:"'])\/\/(?!\/\/).*/g, '');
  return result;
}

function walkDir(dir, pkgRelPath) {
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
      walkDir(full, `${pkgRelPath}/${entry}`);
    } else if (stat.isFile()) {
      const ext = path.extname(entry);
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      const fileRel = `${pkgRelPath}/${entry}`;
      if (ALLOWLIST.has(fileRel)) continue;
      const content = readFileSync(full, 'utf-8');
      // Strip comments before scanning — JSDoc examples and block comments
      // are documentation, not implementation code.
      const codeOnly = stripComments(content);
      for (const { pattern, label } of FORBIDDEN_PATTERNS) {
        // Reset regex lastIndex for global patterns
        pattern.lastIndex = 0;
        if (pattern.test(codeOnly)) {
          const relPath = path.relative(ROOT, full).replace(/\\/g, '/');
          errors.push(`${relPath}: contains ${label}`);
        }
      }
    }
  }
}
