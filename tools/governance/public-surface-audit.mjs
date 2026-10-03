#!/usr/bin/env node
// Public Surface Audit
//
// Ensures that apps and packages consume only approved public seams.
// Retired Product Governance package/contract imports are explicitly forbidden.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');
const APPS_DIR = path.join(ROOT, 'apps');
const PACKAGES_DIR = path.join(ROOT, 'packages');

const INTERNAL_LAYER_REGEX = /(?:from\s+['"]|import\s*\(\s*['"])@memoflow\/([^/'"]+)\/(domain-server|application-server|infrastructure-server|controllers|server\/(?:domain|application|transport|infrastructure))['"]/g;
const RETIRED_PRODUCT_GOVERNANCE_REGEX = /(?:from\s+['"]|import\s*\(\s*['"])(@memoflow\/governance(?:\/[^'"]+)?|@memoflow\/contracts\/governance)['"]/g;

function getSourceFiles(dir, extensions = ['.ts', '.tsx', '.vue']) {
  const results = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') continue;
      results.push(...getSourceFiles(fullPath, extensions));
    } else {
      const ext = path.extname(entry.name);
      if (
        extensions.includes(ext) &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.spec.ts') &&
        !entry.name.endsWith('.test.tsx') &&
        !entry.name.endsWith('.spec.tsx')
      ) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function getPackageForFile(filePath) {
  const rel = path.relative(PACKAGES_DIR, filePath);
  if (rel.startsWith('..')) return null;
  const parts = rel.split(path.sep);
  return parts[0] || null;
}

function auditFile(filePath, violations) {
  const content = readFileSync(filePath, 'utf8');
  const relPath = path.relative(ROOT, filePath).replaceAll('\\', '/');
  const isInApps = relPath.startsWith('apps/');
  const pkg = getPackageForFile(filePath);

  let match;
  INTERNAL_LAYER_REGEX.lastIndex = 0;
  while ((match = INTERNAL_LAYER_REGEX.exec(content)) !== null) {
    const importedPkg = match[1];
    const subpath = match[2];

    if (isInApps) {
      violations.push(`${relPath}: imports @memoflow/${importedPkg}/${subpath} (apps must use public API surface)`);
    } else if (pkg && importedPkg !== pkg) {
      violations.push(`${relPath}: cross-package import @memoflow/${importedPkg}/${subpath} from package "${pkg}" (use a public seam instead)`);
    }
  }

  RETIRED_PRODUCT_GOVERNANCE_REGEX.lastIndex = 0;
  while ((match = RETIRED_PRODUCT_GOVERNANCE_REGEX.exec(content)) !== null) {
    violations.push(`${relPath}: imports retired Product Governance surface ${match[1]} (ADR-113)`);
  }
}

function main() {
  const violations = [];

  for (const app of readdirSync(APPS_DIR, { withFileTypes: true })) {
    if (!app.isDirectory()) continue;
    const srcDir = path.join(APPS_DIR, app.name, 'src');
    if (!existsSync(srcDir)) continue;
    for (const file of getSourceFiles(srcDir)) {
      auditFile(file, violations);
    }
  }

  for (const pkg of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const srcDir = path.join(PACKAGES_DIR, pkg.name, 'src');
    if (!existsSync(srcDir)) continue;
    for (const file of getSourceFiles(srcDir)) {
      auditFile(file, violations);
    }
  }

  if (violations.length > 0) {
    console.error('❌ Public Surface Audit FAILED');
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }

  console.log('✅ Public Surface Audit passed');
}

main();