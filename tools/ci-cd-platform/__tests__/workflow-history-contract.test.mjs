import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readRepoFile = (path) => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

function checkoutBeforeNxSetup(workflow) {
  const setupIndex = workflow.indexOf('uses: ./.github/actions/setup-nx-affected-job');
  assert.notEqual(setupIndex, -1, 'workflow must use setup-nx-affected-job');

  const prefix = workflow.slice(0, setupIndex);
  const checkoutIndex = prefix.lastIndexOf('uses: actions/checkout@');
  if (checkoutIndex < 0) return undefined;

  const stepStart = prefix.lastIndexOf('\n      - ', checkoutIndex);
  return prefix.slice(stepStart < 0 ? checkoutIndex : stepStart);
}

test('scheduled Nx workflows retain enough history for the HEAD~1 fallback', async () => {
  const [setupAction, performance, webFlow, coverage] = await Promise.all([
    readRepoFile('.github/actions/setup-nx-affected-job/action.yml'),
    readRepoFile('.github/workflows/performance-experiment.yml'),
    readRepoFile('.github/workflows/web-flow-audit.yml'),
    readRepoFile('.github/workflows/coverage.yml'),
  ]);

  assert.match(setupAction, /Falling back to HEAD~1/u);

  const performanceCheckout = checkoutBeforeNxSetup(performance);
  const webFlowCheckout = checkoutBeforeNxSetup(webFlow);
  const coverageCheckout = checkoutBeforeNxSetup(coverage);

  assert.ok(performanceCheckout, 'performance workflow must checkout before Nx setup');
  assert.ok(webFlowCheckout, 'web-flow workflow must checkout before Nx setup');
  assert.ok(coverageCheckout, 'coverage workflow must checkout before Nx setup');

  assert.match(performanceCheckout, /fetch-depth:\s*2/u);
  assert.match(webFlowCheckout, /fetch-depth:\s*2/u);
  assert.match(coverageCheckout, /fetch-depth:\s*0/u);
});
