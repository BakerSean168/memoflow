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
  assert.ok(byId.chat.jobs['unit-1'].includes('app-vue:test#1/2'));
  assert.equal(
    byId.chat.jobs['verification-children'].some((key) => key.endsWith(':test:integration')),
    false,
  );
  for (const id of ['aiServer', 'taskServer', 'apiRoute', 'desktopMain']) {
    assert.deepEqual(byId[id].jobs['component-browser'], [], id);
    assert.deepEqual(byId[id].jobs['web-specialized'], [], id);
  }
  assert.ok(byId.desktopRenderer.jobs['web-specialized'].length);
  assert.ok(byId.taskClient.jobs['component-browser'].length);
  assert.ok(byId.taskClient.jobs['web-specialized'].length);
  for (const id of ['aiContract', 'workflow', 'mainDocs']) {
    assert.equal(byId[id].full, true);
    assert.ok(byId[id].jobs.contract.includes('contracts:test:contract'));
  }
  assert.equal(
    byId.testOnly.jobs.build.includes('app-vue:build'),
    false,
    'test-only input must not rebuild production app-vue',
  );
  assert.ok(byId.testOnly.jobs.typecheck.includes('app-vue:typecheck'));
});
test('workflow runs Lint beside Changes and only acceptance waits for backend artifacts', async () => {
  const workflow = YAML.parse(await readFile('.github/workflows/ci.yml', 'utf8'));
  const jobs = workflow.jobs;
  assert.equal(jobs.lint.needs, undefined);
  assert.equal(jobs['scope-detector'].needs, undefined);
  assert.equal(jobs['component-browser'].needs, 'scope-detector');
  assert.equal(jobs['web-visual'].needs, 'scope-detector');
  assert.deepEqual(jobs['web-specialized'].needs, ['scope-detector', 'build-backend']);
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
      "#!/usr/bin/env node\nprocess.exit(process.env.FIXTURE_FAIL === 'true' ? 1 : 0);\n",
    );
    await chmod(pnpm, 0o755);
    const tasks = Object.fromEntries(CI_TARGETS.map((t) => [t, []]));
    tasks.typecheck = ['utils', 'time'];
    const manifest = await buildDeliveryManifest({
      head: sha,
      files: ['packages/utils/src/index.ts'],
      scope: {
        version: 1,
        full: false,
        projects: ['utils', 'time'],
        tasks,
        selection: { version: 1, engine: 'nx-task-inputs', fallback: null },
        unit: [],
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
    assert.equal(execute(['typecheck'], { GITHUB_SHA: sha }).status, 0);
    const receiptDir = path.join(cwd, 'reports/ci-tasks');
    const files = await readdir(receiptDir);
    assert.equal(files.length, 2);
    for (const file of files) {
      const receipt = JSON.parse(await readFile(path.join(receiptDir, file), 'utf8'));
      assert.equal(receipt.exitCode, 0);
      assert.equal(receipt.commit, sha);
      assert.deepEqual(receipt.command, [
        'pnpm',
        'exec',
        'nx',
        'run-many',
        '-t',
        'typecheck',
        '--projects=utils,time',
        '--parallel=3',
        '--outputStyle=static',
      ]);
    }
    assert.equal(execute(['typecheck'], { GITHUB_SHA: sha, FIXTURE_FAIL: 'true' }).status, 1);
    for (const file of files)
      assert.notEqual(JSON.parse(await readFile(path.join(receiptDir, file), 'utf8')).exitCode, 0);
    assert.notEqual(execute(['typecheck', 'missing']).status, 0);
    assert.notEqual(execute(['typecheck', 'utils:typecheck', 'time:typecheck']).status, 0);
    assert.notEqual(execute(['typecheck'], { GITHUB_SHA: 'f'.repeat(40) }).status, 0);
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
  const m = await buildDeliveryManifest({ head: 'a'.repeat(40), files: source.files });
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
