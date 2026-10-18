import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const read = (file) => readFile(file, 'utf8');

test('Nx cache in CI is written to the same directory the cache action saves', async () => {
  const action = await read('.github/actions/setup-nx-affected-job/action.yml');
  assert.match(action, /NX_CACHE_DIRECTORY=\$GITHUB_WORKSPACE\/\.nx\/cache/u);
  const cacheStep = action.slice(action.indexOf('- name: Cache Nx task results'));
  assert.match(cacheStep, /path: \.nx\/cache\n/u);
  assert.match(cacheStep, /key: nx-\$\{\{ runner\.os \}\}-\$\{\{ github\.job \}\}-/u);
  assert.ok(
    action.indexOf('- name: Pin Nx cache directory') <
      action.indexOf('- name: Cache Nx task results'),
    'cache directory must be pinned before restore',
  );
});

test('CI verifies Nx sync generators before affected selection is trusted', async () => {
  const ci = await read('.github/workflows/ci.yml');
  const governance = ci.slice(ci.indexOf('  governance:\n'), ci.indexOf('  governance-oracle:\n'));
  assert.match(governance, /pnpm exec nx sync:check/u);
});

test('typecheck hashes the spec files it type-checks and declares no outputs', async () => {
  const nxJson = JSON.parse(await read('nx.json'));
  const typecheck = nxJson.targetDefaults.typecheck;
  assert.deepEqual(typecheck.inputs, ['default', '^production']);
  assert.deepEqual(typecheck.outputs, []);
  const projectFiles = execFileSync('git', ['ls-files', '*project.json'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  for (const file of projectFiles) {
    const target = JSON.parse(await read(file)).targets?.typecheck;
    if (target?.inputs) {
      assert.ok(
        !target.inputs.includes('production'),
        `${file} typecheck inputs must not drop spec files`,
      );
    }
  }
});

test('workspace-wide build and test configuration is a shared global input', async () => {
  const nxJson = JSON.parse(await read('nx.json'));
  for (const file of [
    'tsconfig.base.json',
    'tsconfig.workspace-src.json',
    'tsconfig.workspace-dist.json',
    'vitest.shared.ts',
    'vitest.workspace-helpers.ts',
    'vite.workspace-aliases.ts',
  ]) {
    assert.ok(nxJson.namedInputs.sharedGlobals.includes(`{workspaceRoot}/${file}`), file);
  }
});
