import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeInventory,
  buildInventory,
  classifyTest,
  collectTestFiles,
} from '../lib/test-inventory.mjs';

const repositoryRoot = process.cwd();
const [repositoryInventory, repositoryTestFiles] = await Promise.all([
  buildInventory(repositoryRoot),
  collectTestFiles(repositoryRoot),
]);

test('classifies explicit boundary and measurement file names', () => {
  assert.equal(classifyTest('apps/desktop/src/main/ipc/system-handlers.spec.ts'), 'boundary-ipc');
  assert.equal(classifyTest('apps/desktop/src/main/database/db.spec.ts'), 'boundary-main');
  assert.equal(classifyTest('packages/task/src/repository.integration.test.ts'), 'integration');
  assert.equal(classifyTest('packages/task/src/sort.bench.ts'), 'perf');
});

test('gives every Desktop primary file exactly one owner', async () => {
  const desktop = repositoryInventory.primary.filter((entry) =>
    entry.path.startsWith('apps/desktop/src/'),
  );
  const desktopFiles = repositoryTestFiles.filter((file) => file.startsWith('apps/desktop/src/'));

  assert.deepEqual(
    desktop.map((entry) => entry.path),
    desktopFiles,
    'every Desktop test file must have exactly one primary inventory entry',
  );
  assert.equal(new Set(desktop.map((entry) => entry.path)).size, desktopFiles.length);
  for (const entry of desktop) {
    assert.equal(
      entry.primarySuite,
      classifyTest(entry.path),
      `Desktop test must stay in its classified primary suite: ${entry.path}`,
    );
  }
  assert.deepEqual(repositoryInventory.missing, []);
  assert.deepEqual(repositoryInventory.duplicate, []);
  assert.deepEqual(repositoryInventory.unexpected, []);
  assert.deepEqual(repositoryInventory.measurementOnly, []);
});

test('primary collectors always own at least one test file', async () => {
  const emptyPrimaryCollectors = repositoryInventory.collectors
    .filter((collector) => collector.type === 'primary' && collector.fileCount === 0)
    .map((collector) => collector.id);

  assert.deepEqual(
    emptyPrimaryCollectors,
    [],
    'a configured primary test target must not silently collect zero files',
  );
});

test('reports missing, duplicate, unexpected and measurement-only collectors', () => {
  const files = [
    'apps/example/src/unit.spec.ts',
    'apps/desktop/src/main/ipc/example.ipc.spec.ts',
    'packages/example/src/missing.spec.ts',
    'packages/example/src/measurement.spec.ts',
  ];
  const inventory = analyzeInventory(files, [
    {
      id: 'apps/example/vitest.config.ts',
      type: 'primary',
      suite: 'unit',
      runner: 'vitest',
      files: [files[0], files[1], 'apps/example/src/not-a-test.ts'],
    },
    {
      id: 'apps/desktop/vitest.ipc.config.ts',
      type: 'primary',
      suite: 'boundary-ipc',
      runner: 'vitest',
      files: [files[1]],
    },
    {
      id: 'packages/example/vitest.coverage.config.ts',
      type: 'measurement',
      suite: 'coverage',
      runner: 'vitest',
      files: [files[0], files[3]],
    },
  ]);

  assert.deepEqual(inventory.missing, [files[3], files[2]]);
  assert.deepEqual(inventory.duplicate, [
    {
      path: files[1],
      suites: ['boundary-ipc', 'unit'],
      collectors: ['apps/desktop/vitest.ipc.config.ts', 'apps/example/vitest.config.ts'],
    },
  ]);
  assert.deepEqual(inventory.measurementOnly, [
    {
      path: files[3],
      collectors: ['packages/example/vitest.coverage.config.ts'],
    },
  ]);
  assert.deepEqual(inventory.unexpected, [
    {
      collector: 'apps/example/vitest.config.ts',
      path: 'apps/example/src/not-a-test.ts',
      reason: 'non-inventory-file',
    },
  ]);
});

test('inventory serialization is independent of filesystem collector order', () => {
  const files = ['apps/desktop/src/example.spec.ts', 'apps/web/src/example.spec.ts'];
  const collectors = [
    {
      id: 'apps/web/vitest.config.ts',
      type: 'primary',
      suite: 'unit',
      runner: 'vitest',
      files: [files[1]],
    },
    {
      id: 'apps/desktop/vitest.config.ts',
      type: 'primary',
      suite: 'unit',
      runner: 'vitest',
      files: [files[0]],
    },
  ];

  assert.deepEqual(
    analyzeInventory(files, collectors),
    analyzeInventory(files, [...collectors].reverse()),
  );
});
