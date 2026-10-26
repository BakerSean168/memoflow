#!/usr/bin/env node
/**
 * Non-gating Oxfmt compatibility report.
 * Applies the same Git-managed and ignored-file selection as quality/fmt.mjs,
 * but never mutates the workspace or emits a production fmt receipt.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { planFiles } from './lib/git-files.mjs';

const root = process.cwd();
const planned = planFiles({ root, mode: 'all' });
const args = ['--list-different', ...planned.checkable];
const start = Date.now();
const command = path.join(root, 'node_modules', '.bin', 'oxfmt');
const proc = spawnSync(command, args, {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  timeout: 180_000,
});

if (proc.error) throw proc.error;
const different = (proc.stdout ?? '')
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean)
  .sort();
if ((proc.status !== 0 && proc.status !== 1) || (proc.status === 1 && different.length === 0)) {
  throw new Error(`Oxfmt failed (status ${proc.status}): ${proc.stderr ?? ''}`);
}
const selected = new Set(planned.checkable);
for (const file of different) {
  if (!selected.has(file)) throw new Error(`Unexpected Oxfmt path: ${file}`);
}
const byExtension = {};
for (const file of different) {
  const ext = path.extname(file) || '[no extension]';
  byExtension[ext] = (byExtension[ext] ?? 0) + 1;
}
const report = {
  kind: 'non-gating-oxfmt-compatibility',
  checked: planned.checkable.length,
  different: different.length,
  durationMs: Date.now() - start,
  byExtension,
  samples: different.slice(0, 20),
};
console.log(JSON.stringify(report, null, 2));
