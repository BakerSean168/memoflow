#!/usr/bin/env node

/**
 * Raw Event Bus Audit
 *
 * Prevents new high-level production code from directly calling
 * `eventBus.on/off/send(...)` instead of going through typed event seams.
 *
 * Scope:
 * - scans `apps/` and `packages/`
 * - excludes tests, generated output, and infrastructure adapter directories
 * - lower-level event bus adapters remain outside this audit's scope
 *
 * Exit codes:
 *   0 - No raw event bus usage found in audited scope
 *   1 - Raw event bus usage detected
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');
const SCAN_ROOTS = [path.join(ROOT, 'apps'), path.join(ROOT, 'packages')];

const SKIP_DIRS = new Set([
  '.git',
  '.nx',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'generated',
  'locales',
  '__tests__',
  '__mocks__',
  'test',
  'tests',
  'e2e',
  'infrastructure-server',
  'infrastructure',
  'infrastructure-client',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const RAW_EVENT_BUS_PATTERN = /\beventBus\.(send|on|off)\s*\(/;

// Format: relative path from repo root (forward slashes)
const ALLOWLIST = new Set([
  // Debug-only event playground, not part of the production typed-event surface.
  'apps/web/public/debug-events.js',
]);

const violations = [];
let auditedFiles = 0;
let allowlistedHits = 0;

for (const scanRoot of SCAN_ROOTS) {
  const relRoot = path.relative(ROOT, scanRoot).split(path.sep).join('/');
  walkDir(scanRoot, relRoot);
}

if (violations.length > 0) {
  console.error(`[raw-event-bus-audit] failed with ${violations.length} issue(s):`);
  for (const violation of violations) {
    console.error(`  ${violation}`);
  }
  process.exit(1);
}

console.log(
  `[raw-event-bus-audit] passed (${auditedFiles} files audited, ${allowlistedHits} documented exemption(s))`,
);

function walkDir(dir, relPath) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }

    const fullPath = path.join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      walkDir(fullPath, `${relPath}/${entry}`);
      continue;
    }

    if (!stat.isFile()) {
      continue;
    }

    const ext = path.extname(entry);
    if (!SOURCE_EXTENSIONS.has(ext)) {
      continue;
    }

    scanFile(fullPath, `${relPath}/${entry}`);
  }
}

function scanFile(fullPath, fileRel) {
  auditedFiles += 1;
  const content = readFileSync(fullPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  let inBlockComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const codeLine = stripComments(line);
    const match = codeLine.match(RAW_EVENT_BUS_PATTERN);
    if (!match) {
      continue;
    }

    if (ALLOWLIST.has(fileRel)) {
      allowlistedHits += 1;
      continue;
    }

    const method = match[1];
    violations.push(
      `${fileRel}:${index + 1}: raw eventBus.${method}() — use createTypedEventPublisher/createTypedEventSubscriber instead`,
    );
  }

  function stripComments(currentLine) {
    let result = '';
    let cursor = 0;

    while (cursor < currentLine.length) {
      if (inBlockComment) {
        const blockEnd = currentLine.indexOf('*/', cursor);
        if (blockEnd === -1) {
          return result;
        }
        cursor = blockEnd + 2;
        inBlockComment = false;
        continue;
      }

      if (currentLine.startsWith('/*', cursor)) {
        inBlockComment = true;
        cursor += 2;
        continue;
      }

      if (currentLine.startsWith('//', cursor)) {
        return result;
      }

      result += currentLine[cursor];
      cursor += 1;
    }

    return result;
  }
}
