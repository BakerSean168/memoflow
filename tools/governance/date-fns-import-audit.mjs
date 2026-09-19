#!/usr/bin/env node
/**
 * ADR-037 / TIME-1206: production date-fns importers must be a strict subset of
 * packages/time/src/engine/**. There is no legacy allowlist after the vNext cutover.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const DATE_FNS_RE = /from\s+['"]date-fns(?:\/[^'"]*)?['"]|require\(\s*['"]date-fns/;
const ENGINE_PREFIX = 'packages/time/src/engine/';

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (
      ent.name === 'node_modules' ||
      ent.name === 'dist' ||
      ent.name === 'dist-electron' ||
      ent.name === 'dist-renderer' ||
      ent.name === 'build' ||
      ent.name === 'coverage' ||
      ent.name === '.git' ||
      ent.name === '.nx'
    ) {
      continue;
    }
    const full = join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs|vue)$/.test(ent.name) && !ent.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const offenders = [];
for (const scanRoot of [join(root, 'packages'), join(root, 'apps')]) {
  for (const file of walk(scanRoot)) {
    const rel = relative(root, file).replace(/\\/g, '/');
    if (rel.startsWith(ENGINE_PREFIX)) continue;
    if (rel.includes('/__tests__/') || /\.(test|spec)\./.test(rel)) continue;
    if (DATE_FNS_RE.test(readFileSync(file, 'utf8'))) offenders.push(rel);
  }
}

if (offenders.length) {
  console.error('[date-fns-import-audit] FAIL: date-fns imports outside packages/time/src/engine/**:');
  for (const offender of offenders) console.error('  -', offender);
  console.error('Fix: migrate the product behavior to @memoflow/time; legacy exemptions are retired.');
  process.exit(1);
}

console.log('[date-fns-import-audit] OK: production date-fns imports are engine-only.');
