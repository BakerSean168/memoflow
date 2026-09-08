import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workspaceRoot = process.cwd();

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
