import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../../../.github/workflows/coverage.yml', import.meta.url);

test('coverage is a scheduled/manual full backstop and cannot silently succeed without governed targets', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(workflow, /schedule:/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /^  push:/mu);
  assert.match(workflow, /GOVERNED_COVERAGE_PROJECTS/u);
  assert.match(
    workflow,
    /Full coverage audit selected no configured targets; refusing a false-green run\.[\s\S]*?exit 1/u,
  );
  assert.match(workflow, /nx run-many -t test:coverage/u);
  assert.match(workflow, /publish-lane-evidence/u);
  assert.doesNotMatch(workflow, /coverage-no-targets/u);
});
