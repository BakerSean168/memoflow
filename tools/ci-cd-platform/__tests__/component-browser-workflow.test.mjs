import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Component Browser executes source contracts without a product or workspace build', async () => {
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  const job = workflow.split('\n  component-browser:')[1].split('\n  contract:')[0];
  assert.match(job, /needs: scope-detector/u);
  assert.match(job, /job_component_browser == 'true'/u);
  assert.match(job, /run-ci-tasks.mjs component-browser/u);
  assert.doesNotMatch(job, /nx run-many.*(?:-t|--target[s]?)\s+build/u);
  assert.doesNotMatch(job, /needs:.*\bbuild\b/u);
});
