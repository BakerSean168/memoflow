/** Shared read-only runner for the package-internal boundary audit. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findBoundaryViolations, shouldSkipSourceFile } from './package-internal-boundary.mjs';

const legacy = [
  'domain-server',
  'domain-shared',
  'application-server',
  'infrastructure-server',
  'controllers',
  'electron-entry',
];
const dbSpecifiers = ['@memoflow/database', '@prisma/client'];
const rules = [
  {
    layer: 'server/domain',
    forbidden: [
      'server/application',
      'server/transport',
      'server/infrastructure',
      'client',
      'electron',
      'api',
      ...legacy,
    ],
    forbiddenExternalSpecifiers: dbSpecifiers,
  },
  {
    layer: 'server/application',
    forbidden: [
      'server/transport',
      'server/infrastructure',
      'client',
      'electron',
      'api',
      ...legacy,
    ],
    forbiddenExternalSpecifiers: dbSpecifiers,
  },
  {
    layer: 'server/transport',
    forbidden: ['server/infrastructure', 'client', 'electron', 'api', ...legacy],
  },
  {
    layer: 'client',
    forbidden: [
      'server/domain',
      'server/application',
      'server/transport',
      'server/infrastructure',
      'api',
      'electron',
      ...legacy,
    ],
  },
];
const exceptions = new Set([
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
]);

function walk(root, dir, rule, violations, counter) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, fullPath, rule, violations, counter);
      continue;
    }
    if (!entry.isFile() || shouldSkipSourceFile(entry.name, fullPath)) continue;
    counter.count += 1;
    const content = readFileSync(fullPath, 'utf8').replace(/^﻿/, '');
    const relPath = relative(root, fullPath).replaceAll('\\', '/');
    violations.push(
      ...findBoundaryViolations({
        content,
        relPath,
        layer: rule.layer,
        forbidden: rule.forbidden,
        forbiddenExternalSpecifiers: rule.forbiddenExternalSpecifiers,
      }),
    );
  }
}

export function runPackageInternalBoundaryAudit(root) {
  const packagesDir = join(root, 'packages');
  const violations = [];
  const counter = { count: 0 };
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || exceptions.has(entry.name)) continue;
    const srcDir = join(packagesDir, entry.name, 'src');
    if (!existsSync(join(srcDir, 'server'))) continue;
    for (const rule of rules) {
      const layerDir = join(srcDir, ...rule.layer.split('/'));
      if (existsSync(layerDir)) walk(root, layerDir, rule, violations, counter);
    }
  }
  const unique = [];
  const seen = new Set();
  for (const violation of violations) {
    const key = `${violation.file}:${violation.line}: ${violation.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(violation);
  }
  return { passed: unique.length === 0, auditedFiles: counter.count, violations: unique };
}
