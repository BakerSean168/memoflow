/**
 * An explicit policy sync guard for Nx's experimental Oxlint JS bridge.
 * ESLint remains the source of truth for the module boundary constraints.
 * Fail closed when somebody changes eslint.config.ts without updating Oxlint.
 */
import assert from 'node:assert/strict';

export function assertBoundaryPolicyMatches(oxlint, eslintConfigs) {
  const authoritative = eslintConfigs
    .map((item) => item.rules?.['@nx/enforce-module-boundaries'])
    .find((rule) => Array.isArray(rule) && rule[0] === 'error');
  assert(authoritative, 'Missing Nx ESLint source-of-truth boundary rule');
  assert(
    oxlint.jsPlugins?.includes('@nx/oxlint/boundaries-plugin'),
    'Missing Nx Oxlint boundary bridge',
  );
  assert.deepEqual(
    oxlint.rules?.['@nx/enforce-module-boundaries'],
    authoritative,
    'Oxlint Nx boundary policy drifted from eslint.config.ts',
  );
  return authoritative[1].depConstraints.length;
}
