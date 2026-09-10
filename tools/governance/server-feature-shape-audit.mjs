#!/usr/bin/env node
/**
 * Server Feature Shape Audit
 *
 * Checks that business feature packages follow the expected server-first shape.
 * The canonical root shape is `src/server/*`; package-specific semantic cores
 * are allowed only when explicitly declared here. Legacy server roots remain
 * forbidden for audited packages.
 */

import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGES_DIR = join(import.meta.dirname, '..', '..', 'packages');

const FORBIDDEN_LEGACY_ROOT_DIRS = [
  'domain-server',
  'domain-shared',
  'application-server',
  'infrastructure-server',
  'controllers',
  'electron-entry',
];

const SERVER_FIRST_REQUIRED_DIRS = ['server', 'api', 'client', 'electron'];
const SERVER_REQUIRED_SUBDIRS = ['application', 'transport', 'infrastructure'];
const SERVER_REQUIRED_FILES = ['server/index.ts'];

/**
 * A server-first package must expose one explicit semantic core. Most packages
 * use `server/domain`; Setting intentionally uses `server/preferences` after
 * ADR-095 retired the empty UserSetting aggregate/DDD ceremony.
 */
const SERVER_SEMANTIC_CORE_DIRS = new Map([
  ['setting', ['preferences']],
]);

const EXCEPTIONS = new Set([
  'powersync-schema',
  'dashboard',
  'domain-shared',
  'contracts',
  'patterns',
  'utils',
  'test-utils',
  'assets',
  'ui-vue-shadcn',
  'ui-react-native',
  'app-vue',
  'app-react',
  'database',
  'ipc-client',
  'http-client',
  // Cross-feature orchestration package; see ADR-031 orchestration-package exception.
  'schedule-orchestration',
]);

const AUDITED_PACKAGES = new Set([
  'account',
  'ai',
  'data-portability',
  'goal',
  'governance',
  'notification',
  'reminder',
  'repository',
  'schedule',
  'setting',
  'task',
]);

function semanticCoreDirsFor(pkg) {
  return SERVER_SEMANTIC_CORE_DIRS.get(pkg) ?? ['domain'];
}

/**
 * Audits one package source root and returns a structured violation or null.
 * Exported so the governance rule itself has regression coverage.
 */
export function auditPackageShape(pkg, srcDir) {
  if (!existsSync(srcDir)) return null;

  const srcContents = readdirSync(srcDir);
  const missingRootDirs = SERVER_FIRST_REQUIRED_DIRS.filter((dir) => !srcContents.includes(dir));
  if (missingRootDirs.length > 0) {
    return { package: pkg, missing: missingRootDirs };
  }

  const forbiddenRootDirs = FORBIDDEN_LEGACY_ROOT_DIRS.filter((dir) => srcContents.includes(dir));
  if (forbiddenRootDirs.length > 0) {
    return { package: pkg, forbidden: forbiddenRootDirs };
  }

  const serverDir = join(srcDir, 'server');
  const serverContents = readdirSync(serverDir);
  const missingServerDirs = SERVER_REQUIRED_SUBDIRS
    .filter((dir) => !serverContents.includes(dir))
    .map((dir) => `server/${dir}`);

  const allowedSemanticCores = semanticCoreDirsFor(pkg);
  if (!allowedSemanticCores.some((dir) => serverContents.includes(dir))) {
    missingServerDirs.push(
      allowedSemanticCores.length === 1
        ? `server/${allowedSemanticCores[0]}`
        : `one of ${allowedSemanticCores.map((dir) => `server/${dir}`).join(', ')}`,
    );
  }

  const missingServerFiles = SERVER_REQUIRED_FILES.filter((file) => !existsSync(join(srcDir, file)));
  const missingServerEntries = [...missingServerDirs, ...missingServerFiles];
  if (missingServerEntries.length > 0) {
    return { package: pkg, missing: missingServerEntries };
  }

  return null;
}

export function main() {
  const packages = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const violations = [];

  for (const pkg of packages) {
    if (EXCEPTIONS.has(pkg)) continue;
    if (!AUDITED_PACKAGES.has(pkg)) continue;

    const violation = auditPackageShape(pkg, join(PACKAGES_DIR, pkg, 'src'));
    if (violation) violations.push(violation);
  }

  if (violations.length > 0) {
    console.error('❌ Server Feature Shape Audit FAILED\n');
    console.error('The following packages violate the required server-first shape:\n');
    for (const violation of violations) {
      if (violation.missing?.length > 0) {
        console.error(`  ${violation.package}: missing ${violation.missing.join(', ')}`);
      }
      if (violation.forbidden?.length > 0) {
        console.error(`  ${violation.package}: forbidden legacy root ${violation.forbidden.join(', ')}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  console.log('✅ Server Feature Shape Audit passed');
}

const entryArg = process.argv[1];
if (entryArg && import.meta.url === pathToFileURL(entryArg).href) {
  main();
}
