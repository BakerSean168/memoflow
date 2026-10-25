import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildDeliveryManifest } from '../generate-delivery-manifest.mjs';
import { CI_CHECK_JOBS, evaluateCiCheck, validWebReceiptArtifactPath } from '../lib/ci-check.mjs';
import { CI_TARGETS } from '../lib/task-selection.mjs';
import { taskCommand } from '../lib/dispatch.mjs';
import { digest } from '../lib/contracts.mjs';

const sha = 'a'.repeat(40);
async function fixture(web = true) {
  const tasks = Object.fromEntries(CI_TARGETS.map((t) => [t, []]));
  Object.assign(tasks, {
    build: ['web'],
    typecheck: ['web'],
    test: ['app-vue', 'web'],
    'test:interaction': web ? ['ui-storybook'] : [],
    'test:integration': ['api'],
    'test:ipc': ['desktop'],
    'test:main': ['desktop'],
  });
  const manifest = await buildDeliveryManifest({
    head: sha,
    base: 'b'.repeat(40),
    files: web ? ['packages/app-vue/src/router/index.ts'] : ['packages/utils/src/index.ts'],
    scope: {
      version: 1,
      full: false,
      projects: ['app-vue', 'web'],
      tasks,
      selection: { version: 1, engine: 'nx-task-inputs', fallback: null },
      unit: ['app-vue', 'web'],
      coverage: [],
      smoke: [],
      integration: [],
      boundary: [],
      perf: [],
      webFlow: web,
      desktopFlow: false,
      browserRequired: web,
    },
  });
  const needs = Object.fromEntries(
    Object.entries(CI_CHECK_JOBS).map(([id, enabled]) => [
      id,
      { result: enabled(manifest) ? 'success' : 'skipped' },
    ]),
  );
  needs['scope-detector'].outputs = { manifest_digest: manifest.digest };
  const taskReceipts = Object.entries(manifest.dispatch.jobs).flatMap(([job, plan]) =>
    plan.tasks.map((task) =>
      seal({
        kind: 'ci-task-receipt-v1',
        version: 1,
        job,
        key: task.key,
        taskDigest: digest(task),
        planDigest: digest(plan.tasks),
        commit: sha,
        runId: '123',
        runAttempt: 1,
        manifestDigest: job === 'lint' ? null : manifest.digest,
        command: taskCommand(task),
        resourceShard:
          job === 'verification-children'
            ? manifest.dispatch.serverShards.find((shard) => shard.keys.includes(task.key)).id
            : null,
        exitCode: 0,
        durationMs: 1,
      }),
    ),
  );
  const webReceipts = manifest.webShards.shards.map((s) => ({
    id: s.id,
    commit: sha,
    runId: '123',
    runAttempt: 1,
    manifestDigest: manifest.digest,
    exitCode: 0,
    specs: s.specs,
  }));
  return { needs, manifest, taskReceipts, webReceipts, commit: sha, runId: '123', runAttempt: 1 };
}
function seal(receipt) {
  const { digest: _old, ...body } = receipt;
  return { ...body, digest: digest(body) };
}
function fails(input) {
  const result = evaluateCiCheck(input);
  assert.equal(result.state, 'failure', JSON.stringify(result));
  return result;
}

test('Check accepts selected tasks, legitimate skips, shards and bound receipts', async () => {
  for (const web of [true, false])
    assert.deepEqual(evaluateCiCheck(await fixture(web)).failures, []);
});
for (const result of ['failure', 'skipped', 'cancelled', 'missing'])
  test(`every required job fails closed on ${result}`, async () => {
    const input = await fixture();
    for (const [id, enabled] of Object.entries(CI_CHECK_JOBS)) {
      if (!enabled(input.manifest)) continue;
      const broken = structuredClone(input);
      if (result === 'missing') delete broken.needs[id];
      else broken.needs[id].result = result;
      fails(broken);
    }
  });
test('unexpected runs, unknown jobs, missing or renamed needs fail', async () => {
  const input = await fixture(false);
  for (const id of ['contract', 'component-browser']) {
    const broken = structuredClone(input);
    broken.needs[id].result = 'success';
    fails(broken);
  }
  const broken = structuredClone(input);
  broken.needs['renamed-job'] = { result: 'success' };
  fails(broken);
});
test('each required primary task needs its own successful receipt', async () => {
  const input = await fixture();
  for (let i = 0; i < input.taskReceipts.length; i++) {
    const missing = structuredClone(input);
    missing.taskReceipts.splice(i, 1);
    fails(missing);
    for (const patch of [
      { exitCode: 1 },
      { exitCode: null },
      { signal: 'SIGTERM' },
      { command: ['true'] },
      { commit: 'c'.repeat(40) },
      { runId: '456' },
      { runAttempt: 2 },
      { manifestDigest: 'd'.repeat(64) },
      { taskDigest: 'e'.repeat(64) },
      { planDigest: 'f'.repeat(64) },
      { resourceShard: '99/99' },
    ]) {
      const broken = structuredClone(input);
      broken.taskReceipts[i] = seal({ ...broken.taskReceipts[i], ...patch });
      fails(broken);
    }
  }
});
test('missing/malformed manifests, wrong dispatch version, omitted tasks and altered digest fail', async () => {
  const input = await fixture();
  for (const value of [null, {}, { ...input.manifest, digest: 'f'.repeat(64) }])
    fails({ ...input, manifest: value });
  for (const mutate of [
    (m) => {
      m.dispatch.version = 2;
    },
    (m) => {
      m.dispatch.jobs.build.tasks = [];
      m.dispatch.jobs.build.required = false;
    },
    (m) => {
      m.unitShards[0].tasks = [];
    },
  ]) {
    const broken = structuredClone(input);
    mutate(broken.manifest);
    broken.manifest = seal(broken.manifest);
    broken.needs['scope-detector'].outputs.manifest_digest = broken.manifest.digest;
    fails(broken);
  }
  fails({ ...input, commit: 'c'.repeat(40) });
  fails({ ...input, runId: null });
});
test('missing, extra, duplicate, stale and skipped Web shard evidence fails', async () => {
  const input = await fixture();
  fails({ ...input, webReceipts: [] });
  fails({ ...input, webReceipts: null });
  for (const patch of [
    { id: '99/99' },
    { exitCode: 1 },
    { specs: [] },
    { runId: '456' },
    { runAttempt: 2 },
    { commit: 'c'.repeat(40) },
    { manifestDigest: 'd'.repeat(64) },
  ])
    fails({ ...input, webReceipts: [{ ...input.webReceipts[0], ...patch }] });
  fails({ ...input, webReceipts: [...input.webReceipts, ...input.webReceipts] });
  assert.equal(
    validWebReceiptArtifactPath('web-shard-receipt-1-0/shard-1.json', input.webReceipts[0]),
    true,
  );
  assert.equal(
    validWebReceiptArtifactPath('web-shard-receipt-2-0/shard-1.json', input.webReceipts[0]),
    false,
  );
  assert.equal(validWebReceiptArtifactPath('shard-1.json', input.webReceipts[0]), true);
});
test('rerun accepts untouched successful jobs but most recent failed receipt beats old green', async () => {
  const input = await fixture();
  input.runAttempt = 2;
  assert.equal(evaluateCiCheck(input).state, 'success');
  input.taskReceipts.push(seal({ ...input.taskReceipts[0], runAttempt: 2, exitCode: 1 }));
  fails(input);
  input.taskReceipts.pop();
  input.webReceipts.push({ ...input.webReceipts[0], runAttempt: 2, exitCode: 1 });
  fails(input);
});
test('duplicate receipts and unexpected receipt keys fail', async () => {
  const input = await fixture();
  fails({ ...input, taskReceipts: [...input.taskReceipts, input.taskReceipts[0]] });
  fails({
    ...input,
    taskReceipts: [...input.taskReceipts, seal({ ...input.taskReceipts[0], key: 'unexpected' })],
  });
});
test('every Server suite has one receipt from its assigned resource shard', async () => {
  const input = await fixture(false);
  const receipt = input.taskReceipts.find((r) => r.job === 'verification-children');
  assert.ok(receipt.resourceShard);
  const broken = structuredClone(input);
  broken.taskReceipts = broken.taskReceipts.map((r) =>
    r.key === receipt.key ? seal({ ...r, resourceShard: null }) : r,
  );
  assert.ok(fails(broken).failures.includes(`${receipt.job}/${receipt.key}:wrong-resource-shard`));
  const omitted = structuredClone(input);
  omitted.taskReceipts = omitted.taskReceipts.filter((r) => r.key !== receipt.key);
  assert.ok(fails(omitted).failures.includes(`${receipt.job}/${receipt.key}:missing-receipt`));
});
test('CLI reads recursive artifacts, rejects missing receipt and invalid artifact path', async () => {
  const input = await fixture();
  const cwd = await mkdtemp(path.join(tmpdir(), 'ci-check-cli-'));
  try {
    for (const d of [
      'scope',
      'reports/ci-tasks/attempt-1',
      'reports/web-shards/web-shard-receipt-1-0',
    ])
      await mkdir(path.join(cwd, d), { recursive: true });
    await writeFile(path.join(cwd, 'scope/manifest.json'), JSON.stringify(input.manifest));
    for (const [i, r] of input.taskReceipts.entries())
      await writeFile(path.join(cwd, `reports/ci-tasks/attempt-1/${i}.json`), JSON.stringify(r));
    const webFile = path.join(cwd, 'reports/web-shards/web-shard-receipt-1-0/shard-1.json');
    await writeFile(webFile, JSON.stringify(input.webReceipts[0]));
    const execute = () =>
      execFileSync(
        process.execPath,
        [path.resolve('tools/ci-cd-platform/ci-check.mjs'), '--manifest', 'scope/manifest.json'],
        {
          cwd,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI_CHECK_NEEDS: JSON.stringify(input.needs),
            GITHUB_SHA: sha,
            GITHUB_RUN_ID: '123',
            GITHUB_RUN_ATTEMPT: '1',
          },
        },
      );
    assert.equal(JSON.parse(execute()).state, 'success');
    await rm(path.join(cwd, 'reports/ci-tasks/attempt-1/0.json'));
    assert.throws(execute);
    await writeFile(
      path.join(cwd, 'reports/ci-tasks/attempt-1/0.json'),
      JSON.stringify(input.taskReceipts[0]),
    );
    await writeFile(webFile, JSON.stringify({ ...input.webReceipts[0], runAttempt: 2 }));
    assert.throws(execute);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
