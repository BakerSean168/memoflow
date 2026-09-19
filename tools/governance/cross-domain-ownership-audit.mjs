#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  findCrossDomainOwnershipViolations,
  validateCrossDomainOwnershipManifest,
} from './lib/cross-domain-ownership.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');
const manifest = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'cross-domain-ownership-manifest.json'), 'utf8'),
);
const manifestErrors = validateCrossDomainOwnershipManifest(manifest);
if (manifestErrors.length > 0) {
  console.error(`[cross-domain-ownership-audit] invalid manifest (${manifestErrors.length} issue(s)):`);
  for (const error of manifestErrors) console.error(`  ${error}`);
  process.exit(1);
}

const violations = findCrossDomainOwnershipViolations(ROOT, manifest);
if (violations.length > 0) {
  console.error(
    `[cross-domain-ownership-audit] failed with ${violations.length} ownership residue(s):`,
  );
  for (const violation of violations) {
    console.error(
      `  ${violation.kind}: ${violation.relativePath} (${violation.value}; owner=${violation.owner})`,
    );
  }
  process.exit(1);
}

console.log(
  `[cross-domain-ownership-audit] passed (${manifest.owners.length} owner lock(s), ${manifest.retiredVocabulary.length} retired vocabulary lock(s), ${manifest.exceptions.length} documented exception(s))`,
);
