#!/usr/bin/env node

/**
 * Desktop Runtime Locator Audit
 *
 * Scans `apps/desktop/src/main` for module-level singleton getters,
 * `static getOccurrence()` patterns, and module-level process-global owners
 * (`let xxx: XxxManager | null = null`) that act as service locators.
 *
 * These patterns bypass explicit dependency injection and make the desktop
 * main process harder to test and reason about.
 *
 * Allowed patterns:
 *   - Constructor injection / explicit deps object passing
 *   - Test helpers in `__tests__/` directories
 *   - Local variables inside function bodies (not module-level)
 *
 * Exit codes:
 *   0 - No new locator violations found
 *   1 - New locator violations detected
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');
const SCAN_DIR = path.join(ROOT, 'apps', 'desktop', 'src', 'main');

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.nx',
  '__mocks__', 'generated',
]);

// __tests__ are allowed — test helpers may legitimately reset singletons
const TEST_DIRS = new Set(['__tests__', 'test', 'tests', 'e2e']);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

// ────────────────────────────────────────────────────────────────────────
// Allowlist: existing violations that will be phased out in Track M.
// Format: relative path from repo root (forward slashes)
// ────────────────────────────────────────────────────────────────────────

// Module-level singleton getters (exported getter functions)
// Existing violations to be phased out in Track M.
const ALLOWLIST_GETTERS = new Set([
  'apps/desktop/src/main/lifecycle/window-manager.ts',
  'apps/desktop/src/main/database/powersync.ts',
  'apps/desktop/src/main/desktop-features/index.ts',
  'apps/desktop/src/main/lifecycle/desktop-chrome.ts',
  'apps/desktop/src/main/modules/auto-update/auto-update-manager.ts',
  'apps/desktop/src/main/runtime-init.ts',
  'apps/desktop/src/main/user-data-path.ts',
  'apps/desktop/src/main/utils/api-config.ts',
  'apps/desktop/src/main/utils/ipc-cache.ts',
  'apps/desktop/src/main/utils/memory-monitor.ts',
]);

// Module-level process-global owners (let xxx: T | null = null)
const ALLOWLIST_MODULE_OWNERS = new Set([
  'apps/desktop/src/main/lifecycle/window-manager.ts',
  'apps/desktop/src/main/main.ts',
  'apps/desktop/src/main/lifecycle/app-lifecycle.ts',
  'apps/desktop/src/main/desktop-features/index.ts',
  'apps/desktop/src/main/utils/memory-monitor.ts',
  'apps/desktop/src/main/utils/ipc-cache.ts',
  'apps/desktop/src/main/database/powersync.ts',
  'apps/desktop/src/main/modules/auto-update/auto-update-manager.ts',
]);

const errors = [];

walkDir(SCAN_DIR, 'apps/desktop/src/main');

if (errors.length > 0) {
  console.error(`[desktop-runtime-locator-audit] failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`  ${error}`);
  }
  process.exit(1);
} else {
  console.log('[desktop-runtime-locator-audit] passed: no new runtime locator patterns in desktop main');
}

// ────────────────────────────────────────────────────────────────────────
// Walk & scan
// ────────────────────────────────────────────────────────────────────────

function walkDir(dir, relPath) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;

    // Allow test directories — test helpers may legitimately reset singletons
    if (TEST_DIRS.has(entry)) continue;

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
      scanFile(full, `${relPath}/${entry}`);
    }
  }
}

function scanFile(fullPath, fileRel) {
  const content = readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // ── Pattern 1: exported singleton getter functions ──
    // e.g. `export function getWindowManager(` or `export function getDesktopAuthService(`
    if (!ALLOWLIST_GETTERS.has(fileRel)) {
      const getterMatch = line.match(/export\s+function\s+get([A-Z]\w+)\s*\(/);
      if (getterMatch) {
        // Verify it returns a module-level variable (not a factory)
        const getterName = `get${getterMatch[1]}`;
        // Look for the typical pattern: returns a module-level let
        const bodySnippet = lines.slice(i, Math.min(i + 30, lines.length)).join('\n');
        if (/return\s+_\w+/.test(bodySnippet) || /return\s+\w+!/.test(bodySnippet) || /return\s+\w+\s*;/.test(bodySnippet)) {
          errors.push(`${fileRel}:${lineNum}: exported singleton getter '${getterName}()' — use explicit injection instead`);
        }
      }
    }

    // ── Pattern 2: static getOccurrence() ──
    if (/\bstatic\s+getOccurrence\s*\(\s*\)/.test(line)) {
      // Already covered by singleton-audit for packages, but double-check
      // desktop main too (singleton-audit only scans packages/)
      errors.push(`${fileRel}:${lineNum}: static getOccurrence() — use explicit injection instead`);
    }

    // ── Pattern 3: module-level `let xxx: XxxManager | null = null` ──
    // Only flag top-level declarations (no leading whitespace or minimal indent)
    if (!ALLOWLIST_MODULE_OWNERS.has(fileRel)) {
      const moduleOwnerMatch = line.match(/^let\s+(\w+):\s*(\w+Manager|\w+Service|\w+Registry|\w+Coordinator)\s*\|\s*null\s*=\s*null/);
      if (moduleOwnerMatch) {
        const varName = moduleOwnerMatch[1];
        const typeName = moduleOwnerMatch[2];
        errors.push(`${fileRel}:${lineNum}: module-level owner 'let ${varName}: ${typeName} | null = null' — use runtime-owned object graph instead`);
      }
    }
  }
}
