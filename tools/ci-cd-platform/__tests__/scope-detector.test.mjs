import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GLOBAL_SURFACE_EXCEPTIONS,
  isGlobalSurface,
  detectScope,
} from '../lib/scope-detector.mjs';
import { classifyRisk } from '../lib/risk.mjs';

test('generated inventory and review registry are the only exemptions from the global surface', () => {
  assert.deepEqual([...GLOBAL_SURFACE_EXCEPTIONS].sort(), [
    'tools/test-system-v2/architecture-review-registry.json',
    'tools/test-system-v2/test-inventory.json',
  ]);
  for (const file of GLOBAL_SURFACE_EXCEPTIONS) {
    assert.equal(isGlobalSurface([file]), false, file);
  }
  // The exemption is exact-path only: neighbouring sources and look-alike
  // names inside the same global-surface directory still force a full run.
  for (const file of [
    'tools/test-system-v2/inventory.mjs',
    'tools/test-system-v2/lib/architecture-execution.mjs',
    'tools/test-system-v2/test-inventory.json.bak',
    'tools/test-system-v2/web-spec-durations.json',
    'tools/ci-cd-platform/lib/scope-detector.mjs',
  ]) {
    assert.equal(isGlobalSurface([file]), true, file);
  }
});

test('database and prisma changes are selected by the Nx graph, not by a global surface', () => {
  for (const file of [
    'packages/database/src/index.ts',
    'packages/database/prisma/schema/goal.prisma',
    'apps/api/prisma/schema.prisma',
    'packages/database/prisma/migrations/20260101000000_init/migration.sql',
  ]) {
    assert.equal(isGlobalSurface([file]), false, file);
  }
  // Only the surfaces that invalidate every task keep the blanket trigger.
  for (const file of [
    'package.json',
    'pnpm-lock.yaml',
    'nx.json',
    '.github/workflows/ci.yml',
    'tools/ci-cd-platform/lib/dispatch.mjs',
  ]) {
    assert.equal(isGlobalSurface([file]), true, file);
  }
});

test('bookkeeping manifests stay package-level, never root (no full-run escalation)', () => {
  for (const file of GLOBAL_SURFACE_EXCEPTIONS) {
    assert.equal(classifyRisk([file]).level, 'package', file);
  }
});

test('package code with a regenerated inventory and review hash keeps a narrowed scope', async () => {
  const scope = await detectScope({
    files: [
      'packages/task/src/index.ts',
      'packages/task/src/import-safety.spec.ts',
      'tools/test-system-v2/test-inventory.json',
      'tools/test-system-v2/architecture-review-registry.json',
    ],
  });
  assert.equal(scope.selection.fallback, null);
  assert.equal(scope.full, false);
  assert.ok(scope.tasks.test.includes('task'));
  assert.ok(
    scope.tasks.test.includes('test-system-v2'),
    'governance-owned test-system-v2 tests are still selected',
  );
  assert.ok(scope.tasks.build.includes('task'));
  assert.ok(scope.tasks['test:integration'].includes('task'));
});

test('a prisma-only change keeps every real database consumer in scope', async () => {
  const scope = await detectScope({ files: ['packages/database/prisma/schema/goal.prisma'] });
  assert.equal(scope.selection.fallback, null);
  assert.equal(scope.full, false);
  assert.ok(scope.tasks['test:integration'].includes('database'));
  assert.ok(scope.tasks.test.includes('database'));
  assert.ok(scope.tasks.build.includes('database'));
  // Server-side consumers through the project graph.
  assert.ok(scope.tasks.build.includes('api'));
  assert.ok(scope.tasks.build.includes('desktop'));
  assert.ok(scope.tasks['test:integration'].includes('api'));
  for (const target of ['test:ipc', 'test:main']) {
    assert.ok(scope.tasks[target].includes('desktop'), `${target} keeps the desktop main process`);
  }
  assert.ok(scope.tasks['test:smoke'].includes('api'));
});
