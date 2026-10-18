#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  findSourceLockViolations,
  validateSourceLockManifest,
} from './lib/app-vue-source-locks.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');
const manifest = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'app-vue-source-locks.json'), 'utf8'),
);
const errors = validateSourceLockManifest(manifest);
if (errors.length > 0) {
  console.error(`[app-vue-source-lock-audit] invalid manifest (${errors.length} issue(s)):`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}
const violations = findSourceLockViolations(ROOT, manifest);
if (violations.length > 0) {
  console.error(`[app-vue-source-lock-audit] failed with ${violations.length} violation(s):`);
  for (const v of violations) console.error(`  ${v.id}: ${v.file} [${v.detail}]`);
  process.exit(1);
}
const lockCount = manifest.entries.reduce((sum, entry) => sum + entry.locks.length, 0);
console.log(
  `[app-vue-source-lock-audit] passed (${manifest.entries.length} contract(s), ${lockCount} lock(s))`,
);
