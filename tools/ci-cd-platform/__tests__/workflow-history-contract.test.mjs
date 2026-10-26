import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readRepoFile = (path) => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('scheduled Nx workflows retain enough history for the HEAD~1 fallback', async () => {
  const [setupAction, nightly] = await Promise.all([
    readRepoFile('.github/actions/setup-nx-affected-job/action.yml'),
    readRepoFile('.github/workflows/nightly-audit.yml'),
  ]);

  assert.match(setupAction, /Falling back to HEAD~1/u);

  assert.match(nightly, /Performance Experiment[\s\S]*?fetch-depth:\s*2/u);
  assert.match(nightly, /Web Flow Full Audit[\s\S]*?fetch-depth:\s*2/u);
  assert.match(nightly, /Coverage Statistics[\s\S]*?fetch-depth:\s*0/u);
});
