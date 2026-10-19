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
  assert.equal(rootManifest.lanes.coverage, true);
  assert.equal(rootManifest.lanes.performance, true);
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

import { mkdtemp, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import os from 'node:os';
import { createLaneInput } from '../create-lane-input.mjs';

test('Unit runner preserves Vitest shard arguments, runs each selected task once and preserves failure without retry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memoflow-unit-runner-'));
  try {
    const manifest = await buildDeliveryManifest({
      base: 'base',
      head: 'head',
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
