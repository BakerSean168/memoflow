import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, chmod, symlink, readdir, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { replayCiMatrix } from '../replay-ci-matrix.mjs';
import { buildDeliveryManifest } from '../generate-delivery-manifest.mjs';
import { CI_TARGETS } from '../lib/task-selection.mjs';
import { detectScope } from '../lib/scope-detector.mjs';
import { CI_CHECK_JOBS, evaluateCiCheck } from '../lib/ci-check.mjs';
import { planServerShards } from '../lib/server-shards.mjs';
import { digest, validateDeliveryManifest } from '../lib/contracts.mjs';

process.env.NX_DAEMON = 'false';
test('live Nx replay covers reviewed PR counterexamples and Main full validation', async () => {
  const results = await replayCiMatrix();
  const byId = Object.fromEntries(results.map((r) => [r.id, r.actual]));
  assert.deepEqual(
    Object.entries(byId.docs.jobs)
      .filter(([, tasks]) => tasks.length)
      .map(([id]) => id),
    ['lint'],
  );
  assert.ok(byId.chat.jobs['component-browser'].length);
  assert.ok(byId.chat.jobs['web-unit-1'].includes('app-vue:test#1/2'));
  assert.equal(
    byId.chat.jobs['verification-children'].some((key) => key.endsWith(':test:integration')),
    false,
  );
  for (const id of ['aiServer', 'taskServer', 'apiRoute', 'desktopMain']) {
    assert.deepEqual(byId[id].jobs['component-browser'], [], id);
    assert.equal(byId[id].jobs['web-specialized'], undefined, id);
  }
  assert.ok(byId.desktopRenderer.jobs['web-visual'].length);
  assert.ok(byId.taskClient.jobs['component-browser'].length);
  assert.ok(byId.taskClient.jobs['web-visual'].length);
  for (const id of ['workspaceAliases', 'workflow', 'mainDocs']) {
    assert.equal(byId[id].full, true);
    assert.ok(byId[id].jobs.contract.includes('host-runtime:test:contract'));
  }
  assert.equal(
    byId.testOnly.jobs.build.includes('app-vue:build'),
    false,
    'test-only input must not rebuild production app-vue',
  );
  assert.ok(byId.testOnly.jobs.build.includes('app-vue:typecheck'));
});
test('workflow runs Lint beside Changes, one Build + Typecheck and resource-owned test pools', async () => {
  const workflow = YAML.parse(await readFile('.github/workflows/ci.yml', 'utf8'));
  const jobs = workflow.jobs;
  assert.equal(jobs.lint.needs, undefined);
  assert.equal(jobs['scope-detector'].needs, undefined);
  assert.equal(jobs['component-browser'].needs, 'scope-detector');
  assert.equal(jobs['web-visual'].needs, 'scope-detector');
  assert.equal(jobs['web-specialized'], undefined);
  assert.equal(jobs['build-backend'], undefined);
  assert.equal(jobs.typecheck, undefined);
  assert.equal(jobs.build.name, 'Build + Typecheck');
  for (const id of ['web-unit-1', 'web-unit-2', 'server-unit']) {
    assert.equal(jobs[id].needs, 'scope-detector');
    assert.equal(jobs[id].services, undefined, `${id}: source tests need no database`);
  }
  assert.equal(jobs['ci-check'].if, 'always()');
  assert.deepEqual([...jobs['ci-check'].needs].sort(), Object.keys(CI_CHECK_JOBS).sort());
  for (const [id] of Object.entries(CI_CHECK_JOBS)) {
    if (id === 'scope-detector') continue;
    assert.ok(
      jobs[id].steps.some((s) => s.uses === './.github/actions/publish-task-receipts'),
      id,
    );
  }
  const prepare = await readFile('tools/ci-cd-platform/prepare-ci-manifest.mjs', 'utf8');
  assert.doesNotMatch(
    prepare,
    /resolvePrEvidence|regenerateManifest/u,
    'Main must not reuse a PR run instead of executing regular validation',
  );
  const history = JSON.parse(
    await readFile('tools/ci-cd-platform/__tests__/fixtures/pr-dispatch-matrix.json', 'utf8'),
  );
  const root = history.cases.find((c) => c.id === 'workflow').expected;
  assert.ok(
    root.jobs['web-visual'].includes('web:e2e:visual-regression'),
    'global PR still runs PR visuals rather than an unwired full-only executor',
  );
});
test('Server shards use history, retain exact ownership, balance work and do not depend on input order', () => {
  const tasks = Array.from({ length: 13 }, (_, i) => ({ key: `project-${i}:test:integration` }));
  const plan = planServerShards(tasks);
  assert.deepEqual(planServerShards([...tasks].reverse()), plan);
  assert.deepEqual(plan.flatMap((s) => s.keys).sort(), tasks.map((t) => t.key).sort());
  assert.ok(plan.length > 1);
  assert.deepEqual(planServerShards([]), []);
  assert.equal(planServerShards([{ key: 'api:test:smoke' }]).length, 1);
});
test('every delivery lane command has a manifest-bound lane input provisioned by setup', async () => {
  const { jobs } = YAML.parse(await readFile('.github/workflows/ci.yml', 'utf8'));
  for (const [id, job] of Object.entries(jobs)) {
    for (const step of job.steps ?? []) {
      const lane = step.env?.DELIVERY_LANE ?? job.env?.DELIVERY_LANE;
      if (!lane) continue;
      const setup = job.steps.find((s) => s.uses === './.github/actions/setup-nx-affected-job');
      assert.equal(setup?.with?.lane, lane, `${id}: ${step.name ?? step.run}`);
      assert.equal(setup.with['consume-delivery-manifest'], 'true', `${id}: manifest required`);
    }
  }
});
test('unknown or removed application/package owners expand to full validation', async () => {
  for (const file of ['packages/unknown-owner/src/index.ts', 'apps/removed-app/src/index.ts']) {
    const scope = await detectScope({ files: [file] });
    assert.equal(scope.full, true, file);
    assert.match(scope.selection.fallback, /Unknown project owner/u);
    assert.ok(scope.tasks['test:integration'].includes('api'));
    assert.ok(scope.tasks['test:interaction'].includes('ui-storybook'));
    assert.ok(scope.tasks.build.includes('web'));
  }
});
test('task runner executes the exact Nx batch, emits successful/failed receipts and rejects empty or wrong-SHA plans', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'ci-task-runner-'));
  const execute = (args, env = {}) =>
    spawnSync(process.execPath, [path.resolve('tools/ci-cd-platform/run-ci-tasks.mjs'), ...args], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${cwd}/bin:${process.env.PATH}`,
        GITHUB_RUN_ID: '123',
        GITHUB_RUN_ATTEMPT: '1',
        DELIVERY_LANE: '',
        LANE_INPUT_PATH: '',
        ...env,
      },
    });
  try {
    await mkdir(path.join(cwd, 'bin'));
    await mkdir(path.join(cwd, 'scope'));
    await symlink(path.resolve('tools'), path.join(cwd, 'tools'), 'dir');
    execFileSync('git', ['init', '--initial-branch=main'], { cwd, stdio: 'pipe' });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        '-c',
        'core.hooksPath=/dev/null',
        'commit',
        '--allow-empty',
        '-m',
        'fixture',
      ],
      { cwd, stdio: 'pipe' },
    );
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
    const pnpm = path.join(cwd, 'bin/pnpm');
    await writeFile(
      pnpm,
      "#!/usr/bin/env node\nprocess.exit(process.env.FIXTURE_FAIL === 'true' && process.argv.includes('web:test') ? 1 : 0);\n",
    );
    await chmod(pnpm, 0o755);
    const tasks = Object.fromEntries(CI_TARGETS.map((t) => [t, []]));
    tasks.test = ['web'];
    const manifest = await buildDeliveryManifest({
      head: sha,
      files: ['packages/utils/src/index.ts'],
      scope: {
        version: 1,
        full: false,
        projects: ['utils', 'time'],
        tasks,
        selection: { version: 1, engine: 'nx-task-inputs', fallback: null },
        unit: ['web'],
        coverage: [],
        smoke: [],
        integration: [],
        boundary: [],
        perf: [],
        webFlow: false,
        browserRequired: false,
      },
    });
    await writeFile(path.join(cwd, 'scope/delivery-manifest-v1.json'), JSON.stringify(manifest));
    assert.equal(execute(['web-unit-1'], { GITHUB_SHA: sha }).status, 0);
    const receiptDir = path.join(cwd, 'reports/ci-tasks');
    const files = await readdir(receiptDir);
    assert.equal(files.length, 1);
    for (const file of files) {
      const receipt = JSON.parse(await readFile(path.join(receiptDir, file), 'utf8'));
      assert.equal(receipt.exitCode, 0);
      assert.equal(receipt.commit, sha);
      assert.deepEqual(receipt.command, [
        'pnpm',
        'exec',
        'nx',
        'run',
        'web:test',
        '--outputStyle=static',
      ]);
    }
    assert.equal(execute(['web-unit-1'], { GITHUB_SHA: sha, FIXTURE_FAIL: 'true' }).status, 1);
    for (const file of files)
      assert.notEqual(JSON.parse(await readFile(path.join(receiptDir, file), 'utf8')).exitCode, 0);
    assert.notEqual(execute(['web-unit-1', 'missing']).status, 0);
    assert.notEqual(execute(['web-unit-1', 'web:test', 'time:test']).status, 0);
    assert.notEqual(execute(['web-unit-1'], { GITHUB_SHA: 'f'.repeat(40) }).status, 0);
    assert.notEqual(execute(['contract']).status, 0);
    assert.doesNotThrow(() => validateDeliveryManifest(manifest));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
test('Server receipt assignment cannot silently move a required suite between shards', async () => {
  const fixture = JSON.parse(
    await readFile('tools/ci-cd-platform/__tests__/fixtures/pr-dispatch-matrix.json', 'utf8'),
  );
  const source = fixture.cases.find((c) => c.id === 'apiRoute');
  const m = await buildDeliveryManifest({ base: null, head: 'a'.repeat(40), files: source.files });
  const needs = Object.fromEntries(
    Object.entries(CI_CHECK_JOBS).map(([id, enabled]) => [
      id,
      { result: enabled(m) ? 'success' : 'skipped' },
    ]),
  );
  needs['scope-detector'].outputs = { manifest_digest: m.digest };
  const result = evaluateCiCheck({
    needs,
    manifest: m,
    commit: m.commit,
    runId: '123',
    runAttempt: 1,
    taskReceipts: [],
  });
  assert.equal(result.state, 'failure');
  const { digest: _old, ...body } = m;
  const changed = { ...body, dispatch: { ...m.dispatch, serverShards: [] } };
  changed.digest = digest(changed);
  needs['scope-detector'].outputs.manifest_digest = changed.digest;
  assert.equal(
    evaluateCiCheck({ needs, manifest: changed, commit: m.commit, runId: '123', runAttempt: 1 })
      .state,
    'failure',
  );
});

test('all selected Unit suites have one existing-project owner, including the two exclusive app-vue file shards', async () => {
  for (const row of await replayCiMatrix()) {
    const jobs = row.actual.jobs;
    const keys = Object.values(jobs)
      .flat()
      .filter((key) => /:test(?:#|$)/u.test(key));
    const expected = row.actual.targets.test
      .filter(
        (project) =>
          !['memoflow', 'governance-tools', 'test-system-v2'].includes(project) &&
          !jobs.contract.includes(`${project}:test:contract`),
      )
      .flatMap((project) =>
        project === 'app-vue' ? ['app-vue:test#1/2', 'app-vue:test#2/2'] : [`${project}:test`],
      );
    assert.deepEqual(keys.sort(), expected.sort(), row.id);
    assert.equal(new Set(keys).size, keys.length, `${row.id}: no duplicate suite`);
    for (const [id, tasks] of Object.entries(jobs)) {
      for (const key of tasks.filter((k) => /:test(?:#|$)/u.test(k))) {
        if (key.startsWith('app-vue:') || key.startsWith('web:')) assert.match(id, /^web-unit-/u);
        else if (['api:', 'database:', 'migrator:'].some((prefix) => key.startsWith(prefix)))
          assert.equal(id, 'server-unit');
        else assert.match(id, /^unit-/u);
      }
    }
    assert.equal(
      Object.values(jobs)
        .flat()
        .some((key) => key.startsWith('web:e2e:ai-provider')),
      false,
    );
  }
});
