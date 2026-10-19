#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  findSourceLockViolations,
  validateSourceLockManifest,
} from './lib/app-vue-source-locks.mjs';
import {
  findStructureRuleViolations,
  validateStructureRuleManifest,
} from './lib/app-vue-structure-rules.mjs';

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

const structurePath = path.join(import.meta.dirname, 'app-vue-structure-rules.json');
let structureRuleCount = 0;
if (existsSync(structurePath)) {
  const structureManifest = JSON.parse(readFileSync(structurePath, 'utf8'));
  const structureErrors = validateStructureRuleManifest(structureManifest);
  if (structureErrors.length > 0) {
    console.error(
      `[app-vue-source-lock-audit] invalid structure rules (${structureErrors.length} issue(s)):`,
    );
    for (const error of structureErrors) console.error(`  ${error}`);
    process.exit(1);
  }
  const structureViolations = findStructureRuleViolations(ROOT, structureManifest);
  if (structureViolations.length > 0) {
    console.error(
      `[app-vue-source-lock-audit] structure rules failed with ${structureViolations.length} violation(s):`,
    );
    for (const v of structureViolations) console.error(`  ${v.id}: ${v.file} [${v.detail}]`);
    process.exit(1);
  }
  structureRuleCount = structureManifest.rules.length;
}

const lockCount = manifest.entries.reduce((sum, entry) => sum + entry.locks.length, 0);
console.log(
  `[app-vue-source-lock-audit] passed (${manifest.entries.length} contract(s), ${lockCount} lock(s), ${structureRuleCount} structure rule(s))`,
);
