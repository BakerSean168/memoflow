import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { buildDeliveryManifest } from '../generate-delivery-manifest.mjs';
import { webFlowCandidateFiles } from '../lib/risk.mjs';
import { createNxShowProjectsInvocation } from '../lib/scope-detector.mjs';

const scope = {
  version: 1,
  base: 'base',
  head: 'head',
  full: false,
  projects: ['web'],
  unit: ['web'],
  coverage: [],
  smoke: [],
  integration: [],
  boundary: [],
  perf: [],
  webFlow: true,
  desktopFlow: false,
};

test('builds one deterministic delivery manifest from injected scope', async () => {
  const options = {
    base: 'base',
    head: 'head',
    event: 'pull_request',
    scope,
    files: ['apps/web/src/App.vue'],
  };
  const first = await buildDeliveryManifest(options);
  const second = await buildDeliveryManifest(options);
  assert.equal(first.digest, second.digest);
  assert.equal(first.kind, 'delivery-manifest-v1');
  assert.equal(first.risk.level, 'web-flow');
  assert.equal(first.lanes.web, true);
  assert.equal(first.lanes.integration, false);
});

test('uses the manifest lane policy for docs-only and root changes', async () => {
  const docsManifest = await buildDeliveryManifest({
    base: 'base',
    head: 'head',
    event: 'pull_request',
    scope: { ...scope, projects: [], unit: [], webFlow: false },
    files: ['docs/README.md'],
  });
  assert.equal(docsManifest.lanes.governance, true);
  assert.equal(docsManifest.lanes.validate, false);
  assert.equal(docsManifest.lanes.web, false);

  const rootManifest = await buildDeliveryManifest({
    base: 'base',
    head: 'head',
    event: 'pull_request',
    scope,
    files: ['nx.json'],
  });
  assert.equal(rootManifest.lanes.validate, true);
  assert.equal(rootManifest.lanes.boundary, true);
  assert.equal(rootManifest.lanes.integration, true);
  assert.equal(rootManifest.lanes.web, true);
  assert.equal(rootManifest.lanes.coverage, false);
  assert.equal(rootManifest.lanes.performance, false);
});

test('historical Desktop capability paths do not select Web Flow', async () => {
  const files = [
    'apps/desktop/src/main/capabilities/capability-registry.ts',
    'apps/desktop/src/main/desktop-main-runtime.ts',
    'packages/repository/src/electron/local-vault-runtime.ts',
    'packages/repository/src/electron/local-vault-external-editor.spec.ts',
  ];
  // The detector computes scope.webFlow from these candidates only.
  assert.deepEqual(webFlowCandidateFiles(files), []);
  const manifest = await buildDeliveryManifest({
    base: 'base',
    head: 'head',
    event: 'pull_request',
    scope: {
      ...scope,
      projects: ['desktop', 'repository'],
      unit: ['desktop', 'repository'],
      boundary: ['desktop'],
      integration: [],
      webFlow: false,
      desktopFlow: true,
    },
    files,
  });
  assert.equal(manifest.lanes.validate, true);
  assert.equal(manifest.lanes.web, false);
  assert.ok(manifest.risk.matchedLevels.includes('desktop'));
  assert.ok(!manifest.risk.matchedLevels.includes('web-flow'));
});

test('push to main is an exhaustive full audit regardless of changed path', async () => {
  const manifest = await buildDeliveryManifest({
    base: 'base',
    head: 'head',
    ref: 'refs/heads/main',
    event: 'push',
    scope: {
      ...scope,
      full: true,
      projects: ['desktop', 'web', 'api'],
      desktopFlow: true,
    },
    files: ['docs/README.md'],
  });
  assert.equal(manifest.full, true);
  assert.ok(Object.values(manifest.lanes).every(Boolean));
});

test('scope discovery invokes the installed Nx CLI directly instead of racing pnpm exec wrappers', () => {
  const root = path.resolve(import.meta.dirname, '../../..');
  const invocation = createNxShowProjectsInvocation(['--with-target=test:integration'], root);
  assert.equal(invocation.command, process.execPath);
  assert.match(invocation.args[0], /node_modules[\\/]nx[\\/]dist[\\/]bin[\\/]nx\.js$/u);
  assert.deepEqual(invocation.args.slice(1), [
    'show',
    'projects',
    '--with-target=test:integration',
    '--json',
  ]);
  assert.ok(!invocation.args.includes('pnpm'));
  assert.equal(invocation.bootstrap, path.join(root, 'tools/ci/node-process-bootstrap.cjs'));

  const stdout = execFileSync(invocation.command, invocation.args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require=${invocation.bootstrap}`.trim(),
    },
  });
  assert.ok(JSON.parse(stdout).includes('api'));
});

import { planUnitShards, UNIT_JOB_IDS } from '../lib/unit-shards.mjs';
import { digest, validateDeliveryManifest } from '../lib/contracts.mjs';

test('Unit LPT is deterministic, complete, fixed at three jobs and only splits app-vue', () => {
  const projects = [
    'app-vue',
    'desktop',
    'web',
    'ci-cd-platform',
    'test-system-v2',
    'governance-tools',
    'new-project',
  ];
  const plan = planUnitShards(projects);
  assert.deepEqual(plan, planUnitShards([...projects].reverse()));
  assert.deepEqual(
    plan.map(({ id }) => id),
    UNIT_JOB_IDS,
  );
  const tasks = plan.flatMap(({ tasks }) => tasks);
  assert.deepEqual(
    tasks
      .filter(({ project }) => project === 'app-vue')
      .map(({ shard }) => shard)
      .sort(),
    ['1/2', '2/2'],
  );
  for (const project of projects.filter((project) => project !== 'app-vue')) {
    assert.deepEqual(
      tasks.filter((task) => task.project === project),
      [{ project }],
    );
  }
  assert.equal(tasks.length, projects.length + 1);
  assert.notEqual(
    plan.find(({ tasks }) => tasks.some((task) => task.shard === '1/2')).id,
    plan.find(({ tasks }) => tasks.some((task) => task.shard === '2/2')).id,
  );
  assert.deepEqual(
    planUnitShards([]),
    UNIT_JOB_IDS.map((id) => ({ id, tasks: [] })),
  );
  for (const invalid of [null, ['web', 'web'], ['--all'], ['bad,name'], [123]]) {
    assert.throws(() => planUnitShards(invalid), /unique Nx project names/u);
  }
});

test('Unit LPT keeps app-vue file shards on different jobs for the Full Audit workload', async () => {
  // Full Audit selects every measured project plus the known unmeasured ones (36 projects in
  // run 39208602533). With measured heavy projects, plain LPT put both app-vue halves on unit-3.
  const history = JSON.parse(
    await readFile(new URL('../unit-test-durations.json', import.meta.url), 'utf8'),
  );
  const fullAudit = [
    ...history.ranking.map(({ project }) => project),
    ...history.unmeasuredProjects,
  ];
  assert.ok(fullAudit.length >= 36);
  const plan = planUnitShards(fullAudit);
  const appVueJobs = plan
    .filter(({ tasks }) => tasks.some((task) => task.project === 'app-vue'))
    .map(({ id }) => id);
  assert.equal(appVueJobs.length, 2);
  for (const { tasks } of plan) assert.ok(tasks.length > 0);
  assert.equal(
    plan.flatMap(({ tasks }) => tasks).length,
    fullAudit.filter((project) => project !== 'memoflow').length + 1,
  );
});

test('delivery manifest rejects split Unit shards of one project on the same job', async () => {
  const manifest = await buildDeliveryManifest({
    base: 'base',
    head: 'head',
    event: 'pull_request',
    scope: { ...scope, unit: ['app-vue', 'web'] },
    files: ['apps/web/src/App.vue'],
  });
  assert.doesNotThrow(() => validateDeliveryManifest(manifest));
  const tasks = manifest.unitShards.flatMap((shard) => shard.tasks);
  const tampered = {
    ...manifest,
    unitShards: manifest.unitShards.map((shard, index) => ({
      ...shard,
      tasks: index === 0 ? tasks : [],
    })),
  };
  delete tampered.digest;
  tampered.digest = digest(tampered);
  assert.throws(
    () => validateDeliveryManifest(tampered),
    /split Unit shards of one project must run on different jobs/u,
  );
});

import { mkdtemp, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import os from 'node:os';
import { createLaneInput } from '../create-lane-input.mjs';
import { observeLane } from '../observe-lane.mjs';

test('Unit runner preserves Vitest shard arguments, runs each selected task once and preserves failure without retry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memoflow-unit-runner-'));
  try {
    const manifest = await buildDeliveryManifest({
      base: 'base',
      head: 'head',
      event: 'pull_request',
      full: false,
      ref: 'refs/pull/1/merge',
      files: ['nx.json'],
      scope: { ...scope, unit: ['app-vue', 'desktop', 'web', 'ci-cd-platform', 'test-system-v2'] },
    });
    const manifestPath = path.join(root, 'manifest.json');
    const inputPath = path.join(root, 'input.json');
    const callsPath = path.join(root, 'calls.jsonl');
    await writeFile(manifestPath, JSON.stringify(manifest));
    await createLaneInput({ lane: 'validate', manifest, output: inputPath });
    const pnpm = path.join(root, 'pnpm');
    await writeFile(
      pnpm,
      `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.UNIT_CALLS_PATH, JSON.stringify(process.argv.slice(2)) + '\\n');
console.log('startup spawn ENOENT ECONNREFUSED failed to connect docker daemon cannot find module SIGSEGV SIGABRT SIGBUS segmentation fault native crash flaky unstable flake');
if (process.env.UNIT_FAIL === 'true') { console.error('ECONNREFUSED'); process.exit(17); }
`,
    );
    await chmod(pnpm, 0o755);
    const env = {
      ...process.env,
      PATH: `${root}:${process.env.PATH}`,
      UNIT_CALLS_PATH: callsPath,
      DELIVERY_MANIFEST_PATH: manifestPath,
      LANE_INPUT_PATH: inputPath,
      DELIVERY_LANE: 'validate',
      TEST_REPORTS_DIR: path.join(root, 'reports'),
    };
    for (const { id } of manifest.unitShards) {
      execFileSync(process.execPath, ['tools/ci-cd-platform/run-unit-shard.mjs', id], {
        env,
        stdio: 'pipe',
      });
    }
    const calls = (await readFile(callsPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const expected = manifest.unitShards.flatMap(({ tasks }) =>
      tasks.map((task) => [
        'exec',
        'nx',
        'run',
        `${task.project}:test`,
        '--outputStyle=static',
        ...(task.shard ? [`--shard=${task.shard}`, '--maxWorkers=2'] : []),
      ]),
    );
    assert.deepEqual(calls, expected);
    await writeFile(callsPath, '');
    assert.throws(
      () =>
        execFileSync(process.execPath, ['tools/ci-cd-platform/run-unit-shard.mjs', 'unit-1'], {
          env: { ...env, UNIT_FAIL: 'true' },
          stdio: 'pipe',
        }),
      (error) => error.status === 17,
    );
    assert.equal(
      (await readFile(callsPath, 'utf8')).trim().split('\n').length,
      manifest.unitShards[0].tasks.length,
    );
    const report = JSON.parse(await readFile(path.join(root, 'reports/unit-1-0.json'), 'utf8'));
    assert.equal(report.attempts.length, 1);
    assert.equal(report.result, 'failure');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('shared execution adapter reports actual attempts for every lane and PR/Full Audit command projection', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memoflow-lane-outcomes-'));
  try {
    const pnpm = path.join(root, 'pnpm');
    const callsPath = path.join(root, 'calls.jsonl');
    await writeFile(
      pnpm,
      `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.CALLS_PATH, JSON.stringify(process.argv.slice(2)) + '\\n');
console.log('startup spawn ENOENT ECONNREFUSED failed to connect docker daemon cannot find module SIGSEGV SIGABRT SIGBUS segmentation fault native crash flaky unstable flake');
if (process.env.FAIL_COMMAND === 'true') process.exit(17);
`,
    );
    await chmod(pnpm, 0o755);
    for (const event of ['pull_request', 'workflow_dispatch']) {
      const manifest = await buildDeliveryManifest({
        base: 'base',
        head: 'head',
        event,
        ref: 'refs/heads/test',
        scope: { ...scope, full: event === 'workflow_dispatch' },
        files: ['nx.json'],
      });
      const manifestPath = path.join(root, 'manifest.json');
      await writeFile(manifestPath, JSON.stringify(manifest));
      for (const [lane, tasks] of Object.entries({
        governance: ['memoflow:governance-check'],
        validate: ['lint', 'typecheck', 'build', 'test'],
        boundary: ['test:boundary', 'test:smoke'],
        integration: ['test:integration'],
        web: ['e2e', 'e2e:visual-regression', 'e2e:ai-provider', 'e2e:audit'],
        coverage: ['test:coverage'],
        performance: ['test:perf'],
      })) {
        const inputPath = path.join(root, 'input.json');
        if (!manifest.lanes[lane]) {
          await assert.rejects(createLaneInput({ lane, manifest, output: inputPath }), /not enabled/u);
          continue;
        }
        const input = await createLaneInput({ lane, manifest, output: inputPath });
        for (const task of tasks) {
          const reportsDir = path.join(root, event, lane, task.replaceAll(':', '-'));
          const env = {
            ...process.env,
            PATH: `${root}:${process.env.PATH}`,
            CALLS_PATH: callsPath,
            DELIVERY_MANIFEST_PATH: manifestPath,
            LANE_INPUT_PATH: inputPath,
            DELIVERY_LANE: lane,
            TEST_REPORTS_DIR: reportsDir,
            TEST_REPORT_NAME: 'command',
            TEST_RETRY_INFRASTRUCTURE: 'true',
            GITHUB_STEP_SUMMARY: '',
          };
          const args = [
            'tools/test-system-v2/run-command.mjs',
            '--',
            'pnpm',
            'exec',
            'nx',
            'affected',
            '-t',
            task,
          ];
          for (const failed of [false, true]) {
            await writeFile(callsPath, '');
            let status = 0;
            try {
              execFileSync(process.execPath, args, {
                env: { ...env, FAIL_COMMAND: String(failed) },
                stdio: 'pipe',
              });
            } catch (error) {
              status = error.status;
            }
            assert.equal(status, failed ? 17 : 0);
            const calls = (await readFile(callsPath, 'utf8')).trim().split('\n').map(JSON.parse);
            const count = failed ? 2 : 1;
            assert.equal(calls.length, count);
            assert.ok(
              calls.every(
                (call) => call[2] === (event === 'workflow_dispatch' ? 'run-many' : 'affected'),
              ),
            );
            const report = JSON.parse(
              await readFile(path.join(reportsDir, 'command.json'), 'utf8'),
            );
            assert.equal(report.attempts.length, count);
            assert.equal(report.result, failed ? 'failure' : 'success');
            assert.ok(
              report.attempts.every(
                (attempt) => attempt.classification === (failed ? 'process-crash' : 'success'),
              ),
            );
            const result = JSON.parse(
              await readFile(path.join(reportsDir, `${lane}.command.lane-result.json`), 'utf8'),
            );
            assert.deepEqual(result.failure, {
              classification: failed ? 'process-crash' : 'none',
              attempts: count,
              retried: failed,
            });
            const totalMs = report.attempts.reduce(
              (total, attempt) => total + attempt.durationMs,
              0,
            );
            assert.equal(result.timing.executionMs, totalMs);
            const summary = await observeLane({
              lane,
              input,
              reportsDir,
              output: path.join(root, 'summary.json'),
            });
            assert.equal(summary.timing.attemptCount, count);
            assert.equal(summary.timing.executionMs, totalMs);
            assert.equal(summary.status, failed ? 'failure' : 'success');
          }
        }
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Web manifest projects narrow/full/zero selections into dynamic outputs', async () => {
  // eslint-disable-next-line @nx/enforce-module-boundaries -- contract test checks the Web-owned canonical list
  const { WEB_FLOW_SPECS } = await import('../../../apps/web/web-flow-specs.mjs');
  const { writeManifestOutputs } = await import('../generate-delivery-manifest.mjs');
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const previousOutput = process.env.GITHUB_OUTPUT;
  const root = await mkdtemp(path.join(tmpdir(), 'web-matrix-'));
  try {
    for (const entry of [
      {
        event: 'pull_request',
        full: false,
        files: [`apps/web/e2e/${WEB_FLOW_SPECS[0]}`],
        count: 1,
        specs: [WEB_FLOW_SPECS[0]],
      },
      {
        event: 'pull_request',
        full: false,
        files: ['apps/web/src/App.vue'],
        count: 4,
        specs: WEB_FLOW_SPECS,
      },
      { event: 'workflow_dispatch', full: true, files: [], count: 4, specs: WEB_FLOW_SPECS },
      { event: 'pull_request', full: false, files: ['docs/README.md'], count: 0, specs: [] },
    ]) {
      const m = await buildDeliveryManifest({
        ...entry,
        base: 'base',
        head: 'head',
        scope: { ...scope, full: entry.full, webFlow: entry.count > 0 },
      });
      assert.equal(m.webShards.shardCount, entry.count);
      assert.deepEqual([...m.webShards.specs].sort(), [...entry.specs].sort());
      assert.deepEqual(
        m.webShards.shards.flatMap((shard) => shard.specs).sort(),
        [...entry.specs].sort(),
      );
      const output = path.join(root, `${entry.event}-${entry.count}.txt`);
      process.env.GITHUB_OUTPUT = output;
      await writeManifestOutputs(m, 'scope/delivery-manifest-v1.json');
      const lines = Object.fromEntries(
        (await readFile(output, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => {
            const i = line.indexOf('=');
            return [line.slice(0, i), line.slice(i + 1)];
          }),
      );
      assert.deepEqual(JSON.parse(lines.web_matrix), {
        shard: m.webShards.shards.map((shard) => shard.id),
      });
      assert.equal(lines.lane_web, String(entry.count > 0));
    }
  } finally {
    if (previousOutput === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = previousOutput;
    await rm(root, { recursive: true, force: true });
  }
});
