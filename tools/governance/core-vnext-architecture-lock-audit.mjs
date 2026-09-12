#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
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
  'packages/ai/src',
  'packages/database/src/schema',
  'packages/database/prisma/schema',
  'packages/powersync-schema/src',
  'packages/data-portability/src',
  'packages/app-react/src',
  'packages/app-vue/src',
  'apps/api/src/modules/ai',
  'apps/desktop/src/main/modules/ai',
  'apps/desktop/src/renderer',
  'apps/web/src',
];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.prisma']);
const collectedFiles = scanRoots
  .flatMap((scanRoot) => collectSourceFiles(path.join(ROOT, scanRoot), ROOT, { extensions }))
  .map(({ relPath, absPath }) => ({ relPath, content: readFileSync(absPath, 'utf8') }));
const explicitGenerated = ['packages/database/src/generated/prisma/schema.prisma']
  .map((relPath) => ({ relPath, absPath: path.join(ROOT, relPath) }))
  .filter(({ absPath }) => existsSync(absPath))
  .map(({ relPath, absPath }) => ({ relPath, content: readFileSync(absPath, 'utf8') }));
const files = [...collectedFiles, ...explicitGenerated];

const { violations, auditedFiles } = findCoreVnextArchitectureLockViolations(files);
if (violations.length > 0) {
  console.error(`[core-vnext-architecture-lock-audit] failed with ${violations.length} issue(s):`);
  for (const violation of violations) {
    console.error(`  ${formatCoreVnextArchitectureLockViolation(violation)}`);
  }
  process.exit(1);
}
console.log(
  `[core-vnext-architecture-lock-audit] passed (${auditedFiles} production source files audited)`,
);
