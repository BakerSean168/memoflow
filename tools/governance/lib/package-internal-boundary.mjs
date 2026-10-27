/**
 * Package-Internal Boundary audit (pure logic).
 *
 * Extracted so the audit CLI and unit tests share the same specifier checks.
 * Enforces in-package layering (e.g. `server/application` must not import
 * `server/infrastructure`) plus forbidden external specifier roots
 * (`server/domain` / `server/application` must not import `@memoflow/database`
 * or any of its exported subpaths like `@memoflow/database/prisma`, nor
 * `@prisma/client` directly:
 * Application/Domain consume Port only; Prisma concrete code belongs to
 * Infrastructure — Application/Domain 只消费 Port；Prisma 具体实现属于 Infrastructure).
 */

import { extname } from 'node:path';

export const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.cts']);
export const SERVER_SUBLAYERS = new Set(['domain', 'application', 'transport', 'infrastructure']);
export const LEGACY_LAYER_NAMES = new Set([
  'domain-server',
  'domain-client',
  'application-server',
  'application-client',
  'client',
  'electron',
  'infrastructure-server',
  'infrastructure-client',
  'controllers',
  'api',
  'mocks',
  'electron-entry',
]);

const IMPORT_SPECIFIER_PATTERN = /(?:from\s+['"]|import\s*\(\s*['"]|import\s+['"])([^'"]+)['"]/g;

/**
 * Fail-closed match for a forbidden external specifier. A forbidden root
 * (`@memoflow/database`) also matches every exported subpath
 * (`@memoflow/database/prisma`, `@memoflow/database/...`) so subpath imports
 * cannot bypass the rule. Unrelated specifiers keep exact matching
 * (`@memoflow/databaseX` is not touched).
 */
export function isForbiddenExternalSpecifier(specifier, forbiddenExternalSpecifiers) {
  return forbiddenExternalSpecifiers.some(
    (forbidden) => specifier === forbidden || specifier.startsWith(`${forbidden}/`),
  );
}

/**
 * Determine whether an entry inside a walked layer directory should be skipped
 * from the audit. Mirrors the historical CLI behavior: non-source files,
 * `*.spec.ts` / `*.test.ts` and anything under `__tests__` are test fixtures,
 * not production layering violations.
 */
export function shouldSkipSourceFile(entryName, fullPath) {
  if (!SOURCE_EXTENSIONS.has(extname(entryName))) return true;
  if (entryName.endsWith('.test.ts') || entryName.endsWith('.spec.ts')) return true;
  if (fullPath.includes('__tests__')) return true;
  return false;
}

/**
 * Map an import specifier to the in-package layer it targets, or `null` for
 * external specifiers / non-layer relative paths.
 */
export function getWithinPackageLayer(specifier) {
  if (specifier.startsWith('@/')) {
    return getLayerFromParts(specifier.slice(2).split('/'));
  }

  if (specifier.startsWith('../') || specifier.startsWith('./')) {
    const parts = specifier.split('/').filter((part) => part !== '.' && part !== '..');
    return getLayerFromParts(parts);
  }

  return null;
}

function getLayerFromParts(parts) {
  if (parts.length === 0) return null;

  if (parts[0] === 'server' && SERVER_SUBLAYERS.has(parts[1])) {
    return `server/${parts[1]}`;
  }

  if (SERVER_SUBLAYERS.has(parts[0])) {
    return `server/${parts[0]}`;
  }

  if (LEGACY_LAYER_NAMES.has(parts[0])) {
    return parts[0];
  }

  return null;
}

function lineAt(content, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content[i] === '\n') line += 1;
  }
  return line;
}

/**
 * Scan file content for layering violations against `rule`.
 * Covers `from '…'`, bare side-effect `import '…'`, dynamic `import('…')`
 * and `import type … from '…'` (all matched by the shared pattern).
 *
 * @param {object} input
 * @param {string} input.content  file source
 * @param {string} input.relPath  repo-relative path (for reporting)
 * @param {string} input.layer    current rule layer (`server/domain` …)
 * @param {string[]} input.forbidden             forbidden in-package layer targets
 * @param {string[]} [input.forbiddenExternalSpecifiers] forbidden external specifier roots
 *   (subpaths of a root, e.g. `@memoflow/database/prisma`, are forbidden too)
 * @returns {Array<{file:string, line:number, layer:string, specifier:string, message:string}>}
 */
export function findBoundaryViolations({
  content,
  relPath,
  layer,
  forbidden,
  forbiddenExternalSpecifiers = [],
}) {
  const violations = [];
  let match;
  while ((match = IMPORT_SPECIFIER_PATTERN.exec(content)) !== null) {
    const specifier = match[1];
    const line = lineAt(content, match.index);
    const withinPackageTarget = getWithinPackageLayer(specifier);
    if (withinPackageTarget && forbidden.includes(withinPackageTarget)) {
      violations.push({
        file: relPath,
        line,
        layer,
        specifier,
        message: `${layer} must not import from ${withinPackageTarget} (found: '${specifier}')`,
      });
    } else if (isForbiddenExternalSpecifier(specifier, forbiddenExternalSpecifiers)) {
      violations.push({
        file: relPath,
        line,
        layer,
        specifier,
        message: `${layer} must not import forbidden external specifier '${specifier}' (Application/Domain consume Port only; Prisma concrete code belongs to Infrastructure)`,
      });
    }
  }
  return violations;
}
