import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
require('tsx/cjs');
const helpers = require('../../../vitest.workspace-helpers.ts');
const workspaceRoot = process.cwd();

test('integration workspace aliases resolve Scheduler from source on a fresh checkout', () => {
  const aliases = helpers.createPackageResolveAliases('schedule');
  const bare = aliases.find((entry) => entry.find === '@memoflow/scheduler');
  const deep = aliases.find(
    (entry) => entry.find instanceof RegExp && entry.find.test('@memoflow/scheduler/client'),
  );

  assert.ok(bare, 'missing bare @memoflow/scheduler integration alias');
  assert.equal(
    path.normalize(bare.replacement),
    path.normalize(path.join(workspaceRoot, 'packages/scheduler/src/index.ts')),
  );
  assert.ok(deep, 'missing deep @memoflow/scheduler/* integration alias');
  assert.equal(
    path.normalize(deep.replacement.replace('$1', 'client')),
    path.normalize(path.join(workspaceRoot, 'packages/scheduler/src/client')),
  );
});
