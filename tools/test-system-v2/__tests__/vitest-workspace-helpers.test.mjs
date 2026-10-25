import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workspaceRoot = process.cwd();

test('app-vue coverage retains the complete Unit collection and the stores thresholds', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
    import unit from './packages/app-vue/vitest.config.ts';
    import coverage from './packages/app-vue/vitest.store-coverage.config.ts';
    process.stdout.write(JSON.stringify({
      unit: unit.test.include, coverage: coverage.test.include,
      thresholds: coverage.test.coverage.thresholds,
      setupFiles: coverage.test.setupFiles,
    }));
  `,
    ],
    { cwd: workspaceRoot, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.deepEqual(
    config.coverage,
    config.unit,
    'coverage must not discard components/composables',
  );
  assert.deepEqual(config.thresholds, { statements: 70, lines: 70, functions: 70, branches: 60 });
  assert.deepEqual(config.setupFiles, ['./src/test/setup.ts']);
});

test('integration workspace aliases resolve Scheduler from source on a fresh checkout', () => {
  const script = String.raw`
    const path = require('node:path');
    const helpers = require('./vitest.workspace-helpers.ts');
    const aliases = helpers.createPackageResolveAliases('schedule');
    const bare = aliases.find((entry) => entry.find === '@memoflow/scheduler');
    const deep = aliases.find(
      (entry) => entry.find instanceof RegExp && entry.find.test('@memoflow/scheduler/client'),
    );
    process.stdout.write(JSON.stringify({
      bare: bare?.replacement ?? null,
      deep: deep?.replacement?.replace('$1', 'client') ?? null,
    }));
  `;
  const result = spawnSync(process.execPath, ['--require', 'tsx/cjs', '-e', script], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || 'failed to load integration workspace helpers');
  const aliases = JSON.parse(result.stdout);
  assert.equal(
    path.normalize(aliases.bare),
    path.normalize(path.join(workspaceRoot, 'packages/scheduler/src/index.ts')),
  );
  assert.equal(
    path.normalize(aliases.deep),
    path.normalize(path.join(workspaceRoot, 'packages/scheduler/src/client')),
  );
});
