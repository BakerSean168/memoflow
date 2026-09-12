#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  findVnextRetirementViolations,
  validateVnextRetirementManifest,
} from './lib/vnext-retirement.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');
const manifestPath = path.join(import.meta.dirname, 'vnext-retirement-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const manifestErrors = validateVnextRetirementManifest(manifest);
if (manifestErrors.length > 0) {
  console.error(`[vnext-retirement-audit] invalid manifest (${manifestErrors.length} issue(s)):`);
  for (const error of manifestErrors) console.error(`  ${error}`);
  process.exit(1);
}

const violations = findVnextRetirementViolations(ROOT, manifest);
if (violations.length > 0) {
  console.error(
    `[vnext-retirement-audit] failed with ${violations.length} reintroduced retired surface(s):`,
  );
  for (const violation of violations) {
    console.error(`  ${violation.id}: ${violation.relativePath} (${violation.decision})`);
  }
  process.exit(1);
}

const activeCount = manifest.entries.filter((entry) => entry.status === 'active').length;
const stagedCount = manifest.entries.filter((entry) => entry.status === 'staged').length;
console.log(
  `[vnext-retirement-audit] passed (${activeCount} active lock(s), ${stagedCount} staged lock(s))`,
);
