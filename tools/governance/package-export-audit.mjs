#!/usr/bin/env node
/**
 * Package Export Audit
 *
 * Ensures feature package public surfaces stay within documented whitelist.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');
const PACKAGES = path.join(ROOT, 'packages');
const infraForbiddenNameRegex = /(Prisma|PowerSync|Adapter|Repository)$/;

/**
 * Documented root-export exceptions. AI-VNEXT-07 removed every concrete
 * Python/AIService runtime adapter from the root barrel. The evaluation report
 * file adapter remains host-composed because API/Desktop own the report root.
 */
const DOCUMENTED_ROOT_CONCRETE_EXPORTS = {
  ai: new Set(['AIEvaluationReportFileAdapter']),
};

const APPLICATION_BARREL_SPECIFIERS = ['./application-server', './server/application'];
const INFRA_BARREL_SPECIFIERS = ['./infrastructure-server', './server/infrastructure'];
const API_BARREL_FORBIDDEN_SERVER_SPECIFIER_REGEX =
  /export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s+from\s+['"]\.\.\/server\/(?:domain|application|transport|infrastructure)(?:\/[^'"]*)?['"]/gm;

const DEFAULT_ALLOWED_SUBPATHS = ['.', './api', './client', './electron'];

const STRICT_ALLOWED_SUBPATHS = {};

const PACKAGE_SPECIFIC_SUBPATHS = {
  goal: ['./analytics', './events', './schedule-execution', './schedule-projection'],
  task: ['./analytics', './testing', './schema', './schedule-execution', './schedule-projection'],
  ai: ['./ports', './schema', './testing'],
  repository: ['./schema', './server'],
  'cloud-auth': ['./server'],
  notification: ['./commands', './schedule-execution', './server'],
  reminder: [
    './schema',
    './schedule-execution',
    './schedule-execution/routine',
    './schedule-projection',
    './schedule-projection/routine',
    './routine-runtime',
    './server',
  ],
  contracts: [
    './task',
    './goal',
    './label',
    './governance',
    './reminder',
    './repository',
    './account',
    './schedule',
    './setting',
    './notification',
    './ai',
    './dashboard',
    './response',
    './result',
    './data-portability',
    './shared',
    './primitives',
    './primitives/*',
    './reliable-messaging',
    './operations',
    './electron',
    './mocks',
  ],
  database: ['./prisma'],
  'domain-shared': ['./shared'],
  patterns: ['./scheduler', './repository', './cache', './events', './operations', './lease'],
  utils: [
    './domain',
    './errors',
    './frontend',
    './lifecycle',
    './logger',
    './result',
    './shared',
    './validation',
    './winston',
  ],
  'test-utils': [
    './helpers',
    './helpers/*',
    './mocks',
    './fixtures',
    './fixtures/*',
    './setup',
    './setup/*',
  ],
  assets: ['./images', './audio'],
  'ui-core': ['./styles/globals.css', './styles/theme.css'],
  'ui-vue-shadcn': [
    './components/ui/button',
    './components/ui/card',
    './components/ui/input',
    './components/ui/label',
    './components/ui/sonner',
    './components/ui/tabs',
    './components/ui/tooltip',
    './composables/useProgressBar',
    './globals.css',
  ],
  'app-vue': [
    './web-overlays',
    './di',
    './desktop',
    './shared/utils/desktop-profile-access',
    './plugins/i18n',
    './router',
    './modules/authentication',
    './modules/account',
    './modules/goal',
    './modules/task',
    './modules/schedule',
    './modules/reminder',
    './modules/notification',
    './modules/repository',
    './modules/setting',
    './modules/governance',
    './modules/dashboard/adapters',
    './modules/ai',
  ],
};

function subpathMatches(subpath, pattern) {
  if (pattern.endsWith('/*')) {
    return subpath === pattern.slice(0, -2) || subpath.startsWith(pattern.slice(0, -1));
  }
  return subpath === pattern;
}

function isSubpathAllowed(pkgName, subpath) {
  const strict = STRICT_ALLOWED_SUBPATHS[pkgName];
  if (strict) {
    return strict.some((pattern) => subpathMatches(subpath, pattern));
  }

  const defaultOk = DEFAULT_ALLOWED_SUBPATHS.some((pattern) => subpathMatches(subpath, pattern));
  if (defaultOk) return true;

  const specific = PACKAGE_SPECIFIC_SUBPATHS[pkgName] || [];
  return specific.some((pattern) => subpathMatches(subpath, pattern));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function auditRootBarrel(pkg, violations) {
  const indexPath = path.join(PACKAGES, pkg, 'src', 'index.ts');
  if (!existsSync(indexPath)) return;
  const content = readFileSync(indexPath, 'utf8');
  const rel = path.relative(ROOT, indexPath).replaceAll('\\', '/');

  for (const specifier of APPLICATION_BARREL_SPECIFIERS) {
    const exportAll = new RegExp(
      `export\\s*\\*\\s*from\\s+['\"]${escapeRegExp(specifier)}['\"]`,
      'm',
    );
    if (exportAll.test(content)) {
      violations.push(`${rel} root barrel must not use "export * from '${specifier}'"`);
    }
  }

  for (const specifier of INFRA_BARREL_SPECIFIERS) {
    const exportAll = new RegExp(
      `export\\s*\\*\\s*from\\s+['\"]${escapeRegExp(specifier)}['\"]`,
      'm',
    );
    if (exportAll.test(content)) {
      violations.push(`${rel} root barrel must not use "export * from '${specifier}'"`);
    }

    const namedExportPattern = new RegExp(
      `export\\s*\\{([^}]+)\\}\\s*from\\s+['\"]${escapeRegExp(specifier)}['\"]`,
      'gm',
    );

    let match;
    while ((match = namedExportPattern.exec(content)) !== null) {
      const names = match[1].split(',').map((name) => name.trim());
      const documented = DOCUMENTED_ROOT_CONCRETE_EXPORTS[pkg] ?? new Set();
      for (const name of names) {
        if (infraForbiddenNameRegex.test(name) && !/^create/i.test(name) && !documented.has(name)) {
          violations.push(
            `${rel} re-exports infra concrete '${name}' from ${specifier} (forbidden)`,
          );
        }
      }
    }
  }
}

function auditApiBarrel(pkg, violations) {
  const indexPath = path.join(PACKAGES, pkg, 'src', 'api', 'index.ts');
  if (!existsSync(indexPath)) return;
  const content = readFileSync(indexPath, 'utf8');
  const rel = path.relative(ROOT, indexPath).replaceAll('\\', '/');

  let match;
  API_BARREL_FORBIDDEN_SERVER_SPECIFIER_REGEX.lastIndex = 0;
  while ((match = API_BARREL_FORBIDDEN_SERVER_SPECIFIER_REGEX.exec(content)) !== null) {
    violations.push(`${rel} api barrel must not re-export server internals (${match[0].trim()})`);
  }
}

function auditExportMap(pkg, violations) {
  const pkgJsonPath = path.join(PACKAGES, pkg, 'package.json');
  if (!existsSync(pkgJsonPath)) return;
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  if (!pkgJson.exports) return;

  const rel = path.relative(ROOT, pkgJsonPath).replaceAll('\\', '/');
  for (const key of Object.keys(pkgJson.exports)) {
    if (!isSubpathAllowed(pkg, key)) {
      violations.push(
        `${rel} exports "${key}" which is not in the allowed whitelist for this package`,
      );
    }
  }
}

function main() {
  const pkgs = readdirSync(PACKAGES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const violations = [];

  for (const pkg of pkgs) {
    auditRootBarrel(pkg, violations);
    auditApiBarrel(pkg, violations);
    auditExportMap(pkg, violations);
  }

  if (violations.length > 0) {
    console.error('❌ Package Export Audit FAILED');
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }

  console.log('✅ Package Export Audit passed');
}

main();
