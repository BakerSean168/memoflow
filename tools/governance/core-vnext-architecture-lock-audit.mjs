#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { collectSourceFiles } from './lib/source-scan.mjs';
import {
  findCoreVnextArchitectureLockViolations,
  formatCoreVnextArchitectureLockViolation,
} from './lib/core-vnext-architecture-lock.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');
const scanRoots = [
  'packages/goal/src',
  'packages/task/src',
  'packages/reminder/src',
  'packages/scheduler/src',
  'packages/notification/src',
  'packages/contracts/src',
  'packages/app-react/src',
  'packages/app-vue/src',
  'apps/desktop/src/renderer',
  'apps/web/src',
];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue']);
const files = scanRoots
  .flatMap((scanRoot) => collectSourceFiles(path.join(ROOT, scanRoot), ROOT, { extensions }))
  .map(({ relPath, absPath }) => ({ relPath, content: readFileSync(absPath, 'utf8') }));

const { violations, auditedFiles } = findCoreVnextArchitectureLockViolations(files);
if (violations.length > 0) {
  console.error(`[core-vnext-architecture-lock-audit] failed with ${violations.length} issue(s):`);
  for (const violation of violations) {
    console.error(`  ${formatCoreVnextArchitectureLockViolation(violation)}`);
  }
  process.exit(1);
}
console.log(`[core-vnext-architecture-lock-audit] passed (${auditedFiles} production source files audited)`);
