#!/usr/bin/env node
/**
 * TIME-1206 anti-resurrection gate.
 *
 * Product code must use context-required TimeFacade + canonical
 * TimeContext/TimePresentationStyle. Retired ambient/mixed-style names are not
 * eligible for exemptions; tests may mention them only to assert absence.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const scanRoots = [join(root, 'packages'), join(root, 'apps')];

const forbidden = [
  ['ambient createTimeFacade()', /\bcreateTimeFacade\(\s*\)/g],
  ['defaultTime singleton', /\bdefaultTime\b/g],
  ['mixed PartialTimeStyle', /\bPartialTimeStyle\b/g],
  ['legacy DEFAULT_TIME_STYLE', /\bDEFAULT_TIME_STYLE\b/g],
  ['legacy mergeTimeStyle', /\bmergeTimeStyle\b/g],
  ['legacy resolveTimeZoneId', /\bresolveTimeZoneId\b/g],
  ['legacy withStyle()', /\.withStyle\s*\(/g],
  ['ambient formatLocalHHmm', /\bformatLocalHHmm\b/g],
  ['ambient formatDateToYMD', /\bformatDateToYMD\b/g],
  ['deprecated FormatApi.localHHmm', /\.format\.localHHmm\s*\(/g],
  ['deprecated FormatApi.dateToYmd', /\.format\.dateToYmd\s*\(/g],
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (
      ['node_modules', 'dist', 'build', 'coverage', '.git', '.nx', 'dist-electron', 'dist-renderer'].includes(
        entry.name,
      )
    ) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs|vue)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

function isTestOrFixture(rel) {
  return (
    rel.includes('/__tests__/') ||
    /\.(test|spec)\./.test(rel) ||
    /\.stories\./.test(rel) ||
    rel.includes('/story-fixtures.') ||
    rel.includes('/src/testing/') ||
    rel.includes('/src/test/') ||
    rel.includes('/e2e/')
  );
}

const violations = [];
for (const scanRoot of scanRoots) {
  for (const file of walk(scanRoot)) {
    const rel = relative(root, file).replace(/\\/g, '/');
    if (isTestOrFixture(rel)) continue;
    const source = readFileSync(file, 'utf8');
    for (const [label, regex] of forbidden) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(source))) {
        const line = source.slice(0, match.index).split('\n').length;
        violations.push(`${rel}:${line}: ${label}`);
      }
    }
  }
}

if (violations.length) {
  console.error('[product-time-surface-audit] FAIL: retired Product Time surface resurrected:');
  for (const violation of violations) console.error('  -', violation);
  console.error('Fix: resolve a canonical TimeContext at the boundary and use @memoflow/time explicitly.');
  process.exit(1);
}

console.log('[product-time-surface-audit] OK: no retired ambient/mixed Product Time surface in production.');
