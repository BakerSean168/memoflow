import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import YAML from 'yaml';
import { CI_TARGETS, loadAffectedRunnerInputs } from '../lib/task-selection.mjs';

const require = createRequire(import.meta.url);

test('CI selector uses Nx 24 affected runner inputs, including Ultracache file reads', async () => {
  const nxJson = { nxCloudId: 'test-cloud-id' };
  const nativeConfiguration = { native: 'UltracacheConfigurations handle' };
  const outcome = { status: 'cached', configurations: nativeConfiguration };
  let receivedArgs;
  const runnerInputs = await loadAffectedRunnerInputs(nxJson, {
    runnerInputsForSelection: async (args, config) => {
      receivedArgs = args;
      assert.equal(config, nxJson);
      return { selectivelyHashTsConfig: true, ultracacheConfigurationOutcome: outcome };
    },
    configurationsOf: (value) => {
      assert.equal(value, outcome);
      return value.configurations;
    },
  });
  assert.deepEqual(receivedArgs, { targets: [...CI_TARGETS] });
  assert.equal(runnerInputs.selectivelyHashTsConfig, true);
  assert.equal(runnerInputs.ultracacheConfigurations, nativeConfiguration);
});

test('missing Cloud recording keeps native Nx task inputs, never an empty selection', async () => {
  const nxJson = { affected: { legacy: false } };
  const runnerInputs = await loadAffectedRunnerInputs(nxJson, {
    runnerInputsForSelection: async () => ({
      selectivelyHashTsConfig: false,
      ultracacheConfigurationOutcome: { status: 'skipped', reason: 'offline' },
    }),
    configurationsOf: () => undefined,
  });
  assert.deepEqual(runnerInputs, {
    selectivelyHashTsConfig: false,
    ultracacheConfigurations: undefined,
  });
});

test('Nx 24 exposes the same Ultracache loader used by its affected CLI', () => {
  assert.equal(
    typeof require('nx/src/tasks-runner/run-command').runnerInputsForSelection,
    'function',
  );
  assert.equal(typeof require('nx/src/ultracache/store').configurationsOf, 'function');
});

test('NX_NO_CLOUD is an explicit offline control for CI affected selection', async () => {
  const nxJson = JSON.parse(await readFile('nx.json', 'utf8'));
  const previous = process.env.NX_NO_CLOUD;
  process.env.NX_NO_CLOUD = 'true';
  try {
    const runnerInputs = await loadAffectedRunnerInputs(nxJson);
    assert.equal(runnerInputs.ultracacheConfigurations, undefined);
    assert.equal(runnerInputs.selectivelyHashTsConfig, false);
  } finally {
    if (previous === undefined) delete process.env.NX_NO_CLOUD;
    else process.env.NX_NO_CLOUD = previous;
  }
});

test('Cloud Workers record traces only in an explicit manual workflow', async () => {
  const workflow = YAML.parse(
    await readFile('.github/workflows/nx-ultracache-recording.yml', 'utf8'),
  );
  const config = YAML.parse(await readFile('.nx/ci-config.yaml', 'utf8'));
  const regularCi = await readFile('.github/workflows/ci.yml', 'utf8');

  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.jobs['record-contracts'].if, "github.ref == 'refs/heads/main'");
  assert.equal(workflow.env.NX_CLOUD_AUTO_TASK_PACKING, 'false');
  assert.equal(config.dte['distribute-on'], '3 linux-medium-js');
  assert.deepEqual(config.lifecycle['stop-after'], ['test:contract']);
  const steps = workflow.jobs['record-contracts'].steps;
  assert.ok(steps.some((step) => step.run?.includes('nx-cloud start-workers')));
  assert.ok(
    steps.some((step) => step.run?.includes('nx-cloud stop-all-workers') && step.if === 'always()'),
  );
  const record = steps.find((step) => step.name === 'Record real file reads for contract tasks');
  assert.match(record.run, /nx run-many -t test:contract/u);
  assert.doesNotMatch(record.run, /--skip-nx-cache|--no-cloud/u);
  assert.doesNotMatch(regularCi, /nx-cloud start-workers/u);
});

test('CI Build+Typecheck retains the local runner until the Cloud lifecycle works', async () => {
  const workflow = YAML.parse(await readFile('.github/workflows/ci.yml', 'utf8'));
  assert.equal(workflow.jobs.build.env.NX_NO_CLOUD, 'true');
  assert.equal(workflow.jobs.build['timeout-minutes'], 40);
  assert.equal(workflow.jobs['scope-detector'].env?.NX_NO_CLOUD, undefined);
  assert.equal(workflow.jobs.contract.env?.NX_NO_CLOUD, undefined);
});
