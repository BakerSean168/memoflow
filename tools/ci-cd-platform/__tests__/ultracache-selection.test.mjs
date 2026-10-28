import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import YAML from 'yaml';
import { CI_TARGETS, loadAffectedRunnerInputs, selectCiTasks } from '../lib/task-selection.mjs';
import { verifyRecording } from '../verify-ultracache-recording.mjs';
import {
  initializeSelectionContext,
  selectionContextPayload,
} from '../initialize-ultracache-selection.mjs';

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
    ultracache: { status: 'skipped', reason: 'offline' },
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
  assert.equal(workflow.jobs['record-contracts'].if, 'inputs.record');
  assert.equal(workflow.on.workflow_dispatch.inputs.record.default, true);
  assert.equal(workflow.env.NX_CLOUD_AUTO_TASK_PACKING, 'false');
  assert.equal(config.dte['distribute-on'], '3 linux-medium-js');
  assert.deepEqual(config.lifecycle['stop-after'], ['test', 'test:contract']);
  const steps = workflow.jobs['record-contracts'].steps;
  assert.ok(steps.some((step) => step.run?.includes('nx-cloud start-workers')));
  assert.ok(
    steps.some((step) => step.run?.includes('nx-cloud stop-all-workers') && step.if === 'always()'),
  );
  const record = steps.find((step) => step.name === 'Record real file reads for contract tasks');
  assert.match(record.run, /nx run-many -t test:contract,test/u);
  assert.doesNotMatch(record.run, /--skip-nx-cache|--no-cloud/u);
  assert.match(
    workflow.jobs['record-contracts'].env.NX_ULTRACACHE_RECORDING_SEED,
    /github.run_id.*github.run_attempt/u,
  );
  assert.equal(workflow.jobs['verify-affected'].env.NX_ULTRACACHE_RECORDING_SEED, undefined);
  assert.equal(workflow.env.NX_ULTRACACHE_RECORDING_SEED, undefined);
  const nxJson = JSON.parse(await readFile('nx.json', 'utf8'));
  assert(nxJson.namedInputs.default.some((input) => input.env === 'NX_ULTRACACHE_RECORDING_SEED'));
  assert.match(record.run, /verify-ultracache-recording\.mjs/u);
  assert.equal(workflow.jobs['verify-affected'].needs, 'record-contracts');
  assert.ok(
    workflow.jobs['verify-affected'].steps.some((step) =>
      step.run?.includes('initialize-ultracache-selection.mjs'),
    ),
  );
  assert.doesNotMatch(regularCi, /nx-cloud start-workers/u);
});

test('selection context registers checkout parents without requesting Workers or manual DTE', async () => {
  const env = {
    CI: 'true',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '2',
    GITHUB_REF: 'refs/pull/690/merge',
    NX_CI_EXECUTION_ENV: 'selection',
  };
  const head = 'a'.repeat(40);
  const parents = ['b'.repeat(40), 'c'.repeat(40)];
  const payload = selectionContextPayload(env, head, parents);
  assert.equal(payload.branch, '690');
  assert.equal(payload.ciExecutionId, '123-2');
  assert.equal(payload.runGroup, '123-2-selection');
  assert.equal(payload.pipelineHeadSha, head);
  assert.deepEqual(payload.commitParentShas, parents);
  assert.deepEqual(YAML.parse(payload.ciConfiguration), {
    dte: { 'enabled-by-default': false, 'distribute-on': 'manual' },
  });
  let calls = 0;
  const git = (args) =>
    args[0] === 'rev-parse'
      ? head
      : `tree unused\nparent ${parents[0]}\nparent ${parents[1]}\n\nparent ignored-message`;
  const request = async (url, options) => {
    calls++;
    assert.equal(url.href, 'https://cloud.nx.app/nx-cloud/run-groups/v1/configure');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Nx-Cloud-Id'], 'workspace');
    assert.deepEqual(JSON.parse(options.body), payload);
    return { ok: true };
  };
  await initializeSelectionContext({ nxCloudId: 'workspace' }, { env, git, request });
  assert.equal(calls, 1);
  await initializeSelectionContext(
    { nxCloudId: 'workspace' },
    { env: { ...env, NX_NO_CLOUD: 'true' }, git, request },
  );
  assert.equal(calls, 1);
  await assert.rejects(
    initializeSelectionContext(
      { nxCloudId: 'workspace' },
      {
        env,
        git,
        request: async () => ({ ok: false, status: 503 }),
      },
    ),
    /HTTP 503/u,
  );
  assert.equal(selectionContextPayload({}, head, parents), null);
});

test('recording success requires cache misses, real Workers, processed reports and config generation', () => {
  const log = (cached = 8, workers = 3, processed = 4, rejected = 0) => `
│ 12 │ Successful Tasks │ 100% │ Success Percentage │
│ ${cached} │ Cached Tasks │ 66% │ Cache Hit Percentage │
│ 12 │ Total Executed Tasks │ ${workers} │ Number of Workers │
Reports: ${processed} processed; ${rejected} rejected; 0 skipped with no reads.
Config generation: 1 pass in 100 ms`;
  assert.deepEqual(verifyRecording(log()), {
    successful: 12,
    cached: 8,
    misses: 4,
    workers: 3,
    processed: 4,
    rejected: 0,
    skipped: 0,
  });
  for (const invalid of [
    log(12, 0, 0),
    log(8, 0),
    log(8, 3, 0),
    log(8, 3, 4, 1),
    log().replace('Config generation: 1 pass', 'Config generation: 0 pass'),
    '',
  ]) {
    assert.throws(() => verifyRecording(invalid));
  }
});

test('native configuration handle narrows unrelated inputs and preserves real contracts; uncovered tasks fall back', async () => {
  const {
    connectToNxDb,
    closeDbConnection,
    UltracacheConfigurationStore,
  } = require('nx/src/native');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'memoflow-ultracache-'));
  const db = connectToNxDb(dir);
  const projects = [
    'goal-contracts',
    'task-contracts',
    'goal-workspace-contracts',
    'task-workspace-contracts',
  ];
  const configurations = new UltracacheConfigurationStore(db).import({
    requestedCommit: 'fixture',
    configurationsJson: JSON.stringify(
      Object.fromEntries(
        projects.map((project) => [
          `${project}:test:contract`,
          { commit: 'fixture', inputs: [`packages/${project}/src/**/*.ts`], outputs: [] },
        ]),
      ),
    ),
  });
  const loadRunnerInputs = async () => ({
    selectivelyHashTsConfig: false,
    ultracacheConfigurations: configurations,
    ultracache: { status: 'cached', ...configurations.resolution },
  });
  const nativeInputs = async () => ({
    selectivelyHashTsConfig: false,
    ultracacheConfigurations: undefined,
    ultracache: { status: 'disabled' },
  });
  try {
    const options = { files: ['packages/shared-primitives/src/unread-probe.txt'], full: false };
    const { createProjectGraphAsync } = require('nx/src/project-graph/project-graph');
    const { createTaskPlanningContext } = require('nx/src/hasher/task-planning-context');
    const { createTaskGraph } = require('nx/src/tasks-runner/create-task-graph');
    const graph = await createProjectGraphAsync({ exitOnError: true });
    const nxJson = JSON.parse(await readFile('nx.json', 'utf8'));
    const taskGraph = createTaskGraph(
      graph,
      {},
      ['task-workspace-contracts'],
      ['test:contract'],
      undefined,
      {},
    );
    const plans = createTaskPlanningContext(graph, nxJson).planner.getPlans(
      Object.keys(taskGraph.tasks),
      taskGraph,
      configurations,
    );
    for (const [id, plan] of Object.entries(plans)) {
      assert(
        plan.includes('env:NX_ULTRACACHE_RECORDING_SEED'),
        `${id} lost the recording cache namespace`,
      );
    }
    const baseline = await selectCiTasks(options, { loadRunnerInputs: nativeInputs });
    const recorded = await selectCiTasks(options, { loadRunnerInputs });
    assert.equal(recorded.fallback, null);
    assert(recorded.targets['test:contract'].length < baseline.targets['test:contract'].length);
    for (const project of projects) {
      assert(baseline.targets['test:contract'].includes(project));
      assert(!recorded.targets['test:contract'].includes(project));
    }
    for (const project of baseline.targets['test:contract'].filter((p) => !projects.includes(p))) {
      assert(
        recorded.targets['test:contract'].includes(project),
        `Unrecorded task lost: ${project}`,
      );
    }
    const positive = await selectCiTasks(
      { files: ['packages/task-workspace-contracts/src/task-workspace.dto.ts'], full: false },
      { loadRunnerInputs },
    );
    assert.equal(positive.fallback, null);
    assert(positive.targets['test:contract'].includes('task-workspace-contracts'));
    const failed = await selectCiTasks(options, {
      loadRunnerInputs: async () => {
        throw new Error('Cloud unavailable');
      },
    });
    assert.match(failed.fallback, /Cloud unavailable/u);
    for (const project of baseline.targets['test:contract'])
      assert(failed.targets['test:contract'].includes(project));
    assert(failed.targets['test:contract'].length > 0);
  } finally {
    closeDbConnection(db);
    await rm(dir, { recursive: true, force: true });
  }
});

test('CI Build+Typecheck retains the local runner until the Cloud lifecycle works', async () => {
  const workflow = YAML.parse(await readFile('.github/workflows/ci.yml', 'utf8'));
  assert.equal(workflow.jobs.build.env.NX_NO_CLOUD, 'true');
  assert.equal(workflow.jobs.build['timeout-minutes'], 40);
  assert.equal(workflow.jobs['scope-detector'].env?.NX_NO_CLOUD, undefined);
  assert.equal(workflow.jobs.contract.env?.NX_NO_CLOUD, undefined);
});
