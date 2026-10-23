import { planUnitShards } from '../lib/unit-shards.mjs';
import YAML from 'yaml';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { CI_CHECK_JOBS, evaluateCiCheck, validWebReceiptArtifactPath } from '../lib/ci-check.mjs';
import { buildProvenance, digest } from '../lib/contracts.mjs';

const lanes = (overrides = {}) => ({
  governance: true,
  validate: true,
  boundary: true,
  integration: true,
  web: true,
  coverage: true,
  performance: true,
  ...overrides,
});
const manifest = (laneOverrides = {}, unit = ['app-vue']) => {
  const content = {
    kind: 'delivery-manifest-v1',
    version: 1,
    commit: 'head',
    base: 'base',
    head: 'head',
    event: 'pull_request',
    full: false,
    changedFiles: [],
    risk: { level: 'package', reasons: ['test'] },
    lanes: lanes(laneOverrides),
    scope: { version: 1, unit },
    unitShards: planUnitShards(unit),
    webShards: {
      specs: ['test.spec.ts'],
      shards: [{ id: '1/1', specs: ['test.spec.ts'], estimatedMs: 1 }],
      shardCount: 1,
      fallback: false,
      estimatedTotalMs: 1,
    },
    provenance: buildProvenance({ generator: 'test', input: { laneOverrides, unit } }),
  };
  return { ...content, digest: digest(content) };
};
const receipts = (m) =>
  m?.lanes?.web && m?.webShards?.shards
    ? m.webShards.shards.map((shard) => ({
        id: shard.id,
        runId: 'test-run',
        runAttempt: 1,
        specs: [...shard.specs],
        exitCode: 0,
        manifestDigest: m.digest,
      }))
    : [];
const check = (input) =>
  evaluateCiCheck({
    webReceipts: receipts(input.manifest),
    runId: 'test-run',
    runAttempt: 1,
    ...input,
  });
const verificationOutputs = (m) =>
  Object.fromEntries(
    ['boundary', 'integration', 'coverage', 'performance'].map((lane) => [
      lane,
      m.lanes[lane] ? 'success' : 'skipped',
    ]),
  );
/** Needs exactly as GitHub would report them for a healthy run of `m`. */
function healthyNeeds(m) {
  const needs = {};
  for (const [name, isEnabled] of Object.entries(CI_CHECK_JOBS)) {
    needs[name] = { result: isEnabled(m) ? 'success' : 'skipped', outputs: {} };
  }
  needs['scope-detector'].outputs = { manifest_digest: m.digest };
  if (needs['verification-children'].result === 'success') {
    needs['verification-children'].outputs = verificationOutputs(m);
  }
  return needs;
}

test('CI job graph has one authoritative gate and no dangling dependencies', async () => {
  const workflow = YAML.parse(await readFile('.github/workflows/ci.yml', 'utf8'));
  const jobs = workflow.jobs;
  assert.ok(Object.keys(jobs).every((id) => !id.endsWith('-oracle')));
  for (const [id, job] of Object.entries(jobs)) {
    assert.ok(job['runs-on'] || job.uses, `${id} must be an executable job`);
    for (const dependency of [job.needs ?? []].flat()) {
      assert.ok(jobs[dependency], `${id} needs missing ${dependency}`);
    }
  }
  assert.deepEqual(
    [...jobs['ci-check'].needs].sort(),
    Object.keys(CI_CHECK_JOBS).filter((id) => id !== 'scope-detector')
      .concat('scope-detector').sort(),
  );
  assert.equal(jobs['ci-check'].if, 'always()');
});

test('full run with every lane green passes', () => {
  const m = manifest();
  assert.deepEqual(check({ needs: healthyNeeds(m), manifest: m }).failures, []);
});

test('docs-only run passes with validate/web/verification skipped by the manifest', () => {
  const m = manifest(
    {
      validate: false,
      boundary: false,
      integration: false,
      web: false,
      coverage: false,
      performance: false,
    },
    [],
  );
  const result = check({ needs: healthyNeeds(m), manifest: m });
  assert.equal(result.state, 'success');
  assert.equal(result.jobs['web-flow-shard'].expected, 'skipped');
});

test('unit skip is allowed only when the manifest scope has no unit projects', () => {
  const m = manifest({}, []);
  assert.equal(check({ needs: healthyNeeds(m), manifest: m }).state, 'success');
  const withUnit = manifest();
  const needs = healthyNeeds(withUnit);
  needs['unit-1'].result = 'skipped';
  assert.deepEqual(check({ needs, manifest: withUnit }).failures, ['unit-1:skipped']);
});

for (const result of ['failure', 'cancelled', 'skipped']) {
  test(`enabled lane job ${result} fails the gate`, () => {
    const m = manifest();
    const needs = healthyNeeds(m);
    needs['web-flow-shard'].result = result;
    assert.deepEqual(check({ needs, manifest: m }).failures, [`web-flow-shard:${result}`]);
  });
}

test('a lane that ran although the manifest disabled it fails the gate', () => {
  const m = manifest({ web: false });
  const needs = healthyNeeds(m);
  needs['web-flow-shard'].result = 'success';
  assert.deepEqual(check({ needs, manifest: m }).failures, ['web-flow-shard:unexpected-success']);
});

test('verification sub-lane outputs are checked against the manifest', () => {
  const m = manifest({ performance: false });
  const needs = healthyNeeds(m);
  needs['verification-children'].outputs.coverage = 'failure';
  needs['verification-children'].outputs.performance = 'success';
  assert.deepEqual(check({ needs, manifest: m }).failures, [
    'verification-children/coverage:failure',
    'verification-children/performance:unexpected-success',
  ]);
});

test('detector failure, missing manifest, digest mismatch and unknown jobs fail closed', () => {
  const m = manifest();
  const failedDetector = healthyNeeds(m);
  failedDetector['scope-detector'].result = 'failure';
  assert.equal(check({ needs: failedDetector, manifest: m }).state, 'failure');
  assert.deepEqual(check({ needs: healthyNeeds(m), manifest: null }).failures, [
    'manifest:missing',
  ]);
  const tampered = manifest({ web: false });
  assert.deepEqual(check({ needs: healthyNeeds(m), manifest: tampered }).failures, [
    'manifest:digest-mismatch',
  ]);
  const unknown = { ...healthyNeeds(m), 'new-lane': { result: 'success' } };
  assert.deepEqual(check({ needs: unknown, manifest: m }).failures, ['new-lane:unknown-job']);
  const missing = healthyNeeds(m);
  delete missing.build;
  assert.deepEqual(check({ needs: missing, manifest: m }).failures, ['build:missing-from-needs']);
  assert.deepEqual(check({ needs: null, manifest: m }).failures, ['needs:missing']);
});

test('tampering with lanes while retaining the original digest fails closed', () => {
  const m = manifest();
  const tampered = { ...m, lanes: { ...m.lanes, web: false } };
  const needs = healthyNeeds(tampered);
  assert.equal(check({ needs, manifest: tampered }).state, 'failure');
});

test('invalid manifest contracts are failures rather than exceptions', () => {
  const m = manifest();
  const invalidContracts = [
    { version: 99 },
    { provenance: null },
    { scope: { version: 1 } },
    { lanes: { ...m.lanes, web: undefined } },
  ].map((changes) => {
    const content = { ...m, ...changes };
    delete content.digest;
    return { ...content, digest: digest(content) };
  });
  for (const invalid of [...invalidContracts, { ...m, digest: 'sha256:invalid' }]) {
    const result = check({ needs: healthyNeeds(m), manifest: invalid });
    assert.equal(result.state, 'failure');
    assert.ok(result.failures.some((failure) => failure.startsWith('manifest:')));
  }
});

test('detector manifest digest must exist and be a valid SHA-256 digest', () => {
  const m = manifest();
  for (const invalid of [undefined, '', 'sha256:abc', 'g'.repeat(64), 123]) {
    const needs = healthyNeeds(m);
    needs['scope-detector'].outputs.manifest_digest = invalid;
    assert.equal(check({ needs, manifest: m }).state, 'failure');
  }
});

/** Split ci.yml into top-level job blocks without a YAML dependency. */
function workflowJobs(text) {
  const body = text.slice(text.indexOf('\njobs:\n'));
  const jobs = {};
  const matches = [...body.matchAll(/^  ([a-z0-9-]+):$/gmu)];
  matches.forEach((match, index) => {
    jobs[match[1]] = body.slice(match.index, matches[index + 1]?.index ?? body.length);
  });
  return jobs;
}

test('ci.yml wires CI Check to every lane job, always runs, and reads the manifest', async () => {
  const text = await readFile(
    new URL('../../../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  );
  const jobs = workflowJobs(text);
  const job = jobs['ci-check'];
  assert.ok(job, 'ci-check job exists');
  assert.match(job, /^    name: CI Check$/mu);
  assert.match(job, /^    if: always\(\)$/mu);
  const needsBlock = job.match(/^    needs:\n((?:      - .+\n)+)/mu)?.[1] ?? '';
  const needs = [...needsBlock.matchAll(/- ([a-z0-9-]+)/gu)].map((m) => m[1]);
  assert.deepEqual(needs.sort(), Object.keys(CI_CHECK_JOBS).sort());
  for (const name of Object.keys(CI_CHECK_JOBS)) assert.ok(jobs[name], `${name} exists`);
  assert.match(job, /name: delivery-manifest-v1/u);
  assert.match(job, /toJSON\(needs\)/u);
  assert.match(job, /node \.\/tools\/ci-cd-platform\/ci-check\.mjs/u);
  const laneJobs = Object.entries(jobs)
    .filter(([, block]) => block.includes('uses: ./.github/actions/publish-lane-evidence'))
    .map(([name]) => name);
  assert.ok(laneJobs.length >= 7);
  for (const name of laneJobs)
    assert.ok(name in CI_CHECK_JOBS, `${name} is aggregated by CI Check`);
});

test('reuse requires the build but forbids ordinary lane jobs and rejects missing build evidence', () => {
  const m = manifest(
    Object.fromEntries(
      ['governance', 'validate', 'boundary', 'integration', 'web', 'coverage', 'performance'].map(
        (lane) => [lane, false],
      ),
    ),
    [],
  );
  m.event = 'push';
  m.execution = {
    mode: 'reuse',
    candidate: true,
    testRunId: 123,
    testRunAttempt: 1,
    testHead: 'a'.repeat(40),
    testedCommit: 'b'.repeat(40),
    testedTree: 'c'.repeat(40),
    manifestDigest: 'd'.repeat(64),
    inputsDigest: 'e'.repeat(64),
  };
  delete m.digest;
  m.digest = digest(m);
  const needs = healthyNeeds(m);
  assert.equal(check({ needs, manifest: m }).state, 'success');
  assert.equal(needs.build.result, 'success');
  needs.build.result = 'skipped';
  assert.equal(check({ needs, manifest: m }).state, 'failure');
  needs.build.result = 'success';
  needs['unit-1'].result = 'success';
  assert.equal(check({ needs, manifest: m }).state, 'failure');
});

test('docs-only reuse has no build or test jobs; malformed reuse/full policy fails closed', () => {
  const m = manifest(
    Object.fromEntries(
      ['governance', 'validate', 'boundary', 'integration', 'web', 'coverage', 'performance'].map(
        (lane) => [lane, false],
      ),
    ),
    [],
  );
  m.event = 'push';
  m.execution = {
    mode: 'reuse',
    candidate: false,
    testRunId: 123,
    testRunAttempt: 1,
    testHead: 'a'.repeat(40),
    testedCommit: 'b'.repeat(40),
    testedTree: 'c'.repeat(40),
    manifestDigest: 'd'.repeat(64),
    inputsDigest: 'e'.repeat(64),
  };
  delete m.digest;
  m.digest = digest(m);
  assert.equal(healthyNeeds(m).build.result, 'skipped');
  assert.equal(check({ needs: healthyNeeds(m), manifest: m }).state, 'success');
  for (const execution of [
    { mode: 'unknown' },
    { ...m.execution, testRunId: null },
    { mode: 'full', candidate: true },
  ]) {
    const invalid = { ...m, execution };
    delete invalid.digest;
    invalid.digest = digest(invalid);
    assert.equal(check({ needs: healthyNeeds(m), manifest: invalid }).state, 'failure');
  }
});

for (const id of ['unit-1', 'unit-2', 'unit-3']) {
  for (const status of ['missing', 'failure', 'cancelled', 'skipped']) {
    test(`${id} ${status} cannot pass CI Check while sibling shards are green`, () => {
      const m = manifest({}, ['app-vue', 'desktop', 'web']);
      const needs = healthyNeeds(m);
      if (status === 'missing') delete needs[id];
      else needs[id].result = status;
      assert.equal(check({ needs, manifest: m }).state, 'failure');
      assert.ok(
        check({ needs, manifest: m }).failures.some((failure) => failure.startsWith(`${id}:`)),
      );
    });
  }
}

test('a valid self-digest cannot authorize a missing, duplicated or altered Unit plan', () => {
  const m = manifest({}, ['app-vue', 'desktop', 'web']);
  for (const change of [
    (value) => {
      delete value.unitShards;
    },
    (value) => {
      value.unitShards.pop();
    },
    (value) => {
      value.unitShards[1] = value.unitShards[0];
    },
    (value) => {
      value.unitShards[0].tasks.pop();
    },
    (value) => {
      value.unitShards[0].tasks.push({ project: 'unknown' });
    },
    (value) => {
      value.unitShards[0].tasks[0].shard = '1/3';
    },
  ]) {
    const invalid = structuredClone(m);
    change(invalid);
    delete invalid.digest;
    invalid.digest = digest(invalid);
    const needs = healthyNeeds(m);
    needs['scope-detector'].outputs.manifest_digest = invalid.digest;
    assert.equal(check({ needs, manifest: invalid }).state, 'failure');
  }
});

for (const [name, mutate] of [
  ['missing shard', (rows) => rows.pop()],
  ['extra shard', (rows) => rows.push({ ...rows[0], id: '2/1' })],
  [
    'spec not executed',
    (rows) => {
      rows[0].specs = [];
    },
  ],
  ['duplicate spec', (rows) => rows[0].specs.push(rows[0].specs[0])],
  ['duplicate shard', (rows) => rows.push(structuredClone(rows[0]))],
  [
    'wrong manifest',
    (rows) => {
      rows[0].manifestDigest = '0'.repeat(64);
    },
  ],
  [
    'failed execution',
    (rows) => {
      rows[0].exitCode = 1;
    },
  ],
]) {
  test(`Web evidence fails closed: ${name}`, () => {
    const m = manifest();
    const webReceipts = receipts(m);
    mutate(webReceipts);
    assert.equal(check({ needs: healthyNeeds(m), manifest: m, webReceipts }).state, 'failure');
  });
}

test('Web shard retry selects the latest receipt per shard without rerunning healthy siblings', () => {
  const m = manifest();
  const firstFailure = { ...receipts(m)[0], exitCode: 1 };
  const laterSuccess = { ...receipts(m)[0], runAttempt: 2 };
  const result = check({
    needs: healthyNeeds(m),
    manifest: m,
    runAttempt: 2,
    webReceipts: [firstFailure, laterSuccess],
  });
  assert.deepEqual(result.failures, []);
});

test('Web shard retry never falls back to a previous success after a later failure', () => {
  const m = manifest();
  const laterFailure = { ...receipts(m)[0], runAttempt: 2, exitCode: 1 };
  const result = check({
    needs: healthyNeeds(m),
    manifest: m,
    runAttempt: 2,
    webReceipts: [...receipts(m), laterFailure],
  });
  assert.deepEqual(result.failures, ['web:1/1:invalid-evidence']);
});

test('Web shard receipts fail closed on duplicate attempts, future attempts and wrong run identity', () => {
  const m = manifest();
  const receipt = receipts(m)[0];
  for (const replacement of [
    [receipt, { ...receipt }],
    [{ ...receipt, runAttempt: 2 }],
    [{ ...receipt, runId: 'another-run' }],
    [{ ...receipt, runAttempt: 0 }],
    [{ ...receipt, runAttempt: '2' }],
  ]) {
    const result = check({ needs: healthyNeeds(m), manifest: m, webReceipts: replacement });
    assert.equal(result.state, 'failure', JSON.stringify(replacement));
  }
  assert.equal(check({ needs: healthyNeeds(m), manifest: m, runId: null }).state, 'failure');
});

test('Web shard receipt artifact directory must match its attempt and matrix index', () => {
  const receipt = receipts(manifest())[0];
  assert.equal(validWebReceiptArtifactPath('web-shard-receipt-1-0/shard-1.json', receipt), true);
  // download-artifact extracts a lone pattern match directly into the target
  // directory, so a single-shard run produces a flat receipt path whose
  // identity is bound by the receipt content checks.
  assert.equal(validWebReceiptArtifactPath('shard-1.json', receipt), true);
  assert.equal(validWebReceiptArtifactPath('shard-2.json', receipt), false);
  for (const file of [
    'web-shard-receipt-2-0/shard-1.json',
    'web-shard-receipt-1-1/shard-1.json',
    'web-shard-receipt-1-0/shard-2.json',
    'web-shard-receipt-1-0/../shard-1.json',
    'web-shard-receipt-0/shard-1.json',
  ]) {
    assert.equal(validWebReceiptArtifactPath(file, receipt), false, file);
  }
});

test('CI upload keeps Web receipts from different run attempts distinct', async () => {
  const workflow = await readFile(
    new URL('../../../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  );
  const jobs = workflowJobs(workflow);
  assert.match(
    jobs['web-flow-shard'],
    /name: web-shard-receipt-\$\{\{ github\.run_attempt \}\}-\$\{\{ strategy\.job-index \}\}/u,
  );
  assert.match(jobs['ci-check'], /pattern: web-shard-receipt-\*/u);
});

test('zero Web specs skips the matrix and forbids receipts', () => {
  const m = manifest({ web: false });
  m.webShards = { specs: [], shards: [], shardCount: 0, estimatedTotalMs: 0, fallback: false };
  delete m.digest;
  m.digest = digest(m);
  const needs = healthyNeeds(m);
  assert.equal(check({ needs, manifest: m }).state, 'success');
  assert.equal(check({ needs, manifest: m, webReceipts: [{ id: '1/1' }] }).state, 'failure');
});

test('a valid self-digest cannot authorize a missing or inconsistent Web plan', () => {
  const m = manifest();
  for (const mutate of [
    (value) => {
      delete value.webShards;
    },
    (value) => {
      value.webShards.shardCount += 1;
    },
    (value) => {
      value.webShards.shards[0].specs = [];
    },
    (value) => {
      value.webShards.shards[0].specs.push('test.spec.ts');
    },
    (value) => {
      value.webShards.shards[0].id = '2/2';
    },
  ]) {
    const invalid = structuredClone(m);
    mutate(invalid);
    delete invalid.digest;
    invalid.digest = digest(invalid);
    const needs = healthyNeeds(m);
    needs['scope-detector'].outputs.manifest_digest = invalid.digest;
    assert.equal(check({ needs, manifest: invalid, webReceipts: [] }).state, 'failure');
  }
});

test('CI Check CLI consumes newest shard artifact on retry and rejects a latest failure', async () => {
  const m = manifest();
  const cwd = await mkdtemp(join(tmpdir(), 'memoflow-web-retry-'));
  try {
    const oldDir = join(cwd, 'reports/web-shards/web-shard-receipt-1-0');
    const newDir = join(cwd, 'reports/web-shards/web-shard-receipt-2-0');
    await mkdir(join(cwd, 'scope'), { recursive: true });
    await mkdir(oldDir, { recursive: true });
    await mkdir(newDir, { recursive: true });
    await writeFile(join(cwd, 'scope/delivery-manifest-v1.json'), JSON.stringify(m));
    const oldFailed = { ...receipts(m)[0], exitCode: 1 };
    const currentSucceeded = { ...receipts(m)[0], runAttempt: 2 };
    await writeFile(join(oldDir, 'shard-1.json'), JSON.stringify(oldFailed));
    const newestFile = join(newDir, 'shard-1.json');
    await writeFile(newestFile, JSON.stringify(currentSucceeded));
    const env = {
      ...process.env,
      GITHUB_RUN_ID: 'test-run',
      GITHUB_RUN_ATTEMPT: '2',
      CI_CHECK_NEEDS: JSON.stringify(healthyNeeds(m)),
    };
    const command = resolve('tools/ci-cd-platform/ci-check.mjs');
    const execute = () =>
      execFileSync(process.execPath, [command, '--manifest', 'scope/delivery-manifest-v1.json'], {
        cwd,
        env,
        stdio: 'pipe',
      });
    assert.equal(JSON.parse(execute().toString()).state, 'success');

    await writeFile(newestFile, JSON.stringify({ ...currentSucceeded, exitCode: 1 }));
    assert.throws(execute, /Command failed/u);
    await writeFile(newestFile, JSON.stringify(oldFailed));
    assert.throws(execute, /Command failed/u);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('CI Check CLI accepts the flat single-artifact receipt layout', async () => {
  const m = manifest();
  const cwd = await mkdtemp(join(tmpdir(), 'memoflow-web-flat-'));
  try {
    const flatDir = join(cwd, 'reports/web-shards');
    await mkdir(join(cwd, 'scope'), { recursive: true });
    await mkdir(flatDir, { recursive: true });
    await writeFile(join(cwd, 'scope/delivery-manifest-v1.json'), JSON.stringify(m));
    await writeFile(join(flatDir, 'shard-1.json'), JSON.stringify(receipts(m)[0]));
    const env = {
      ...process.env,
      GITHUB_RUN_ID: 'test-run',
      GITHUB_RUN_ATTEMPT: '1',
      CI_CHECK_NEEDS: JSON.stringify(healthyNeeds(m)),
    };
    const command = resolve('tools/ci-cd-platform/ci-check.mjs');
    const execute = () =>
      execFileSync(process.execPath, [command, '--manifest', 'scope/delivery-manifest-v1.json'], {
        cwd,
        env,
        stdio: 'pipe',
      });
    assert.equal(JSON.parse(execute().toString()).state, 'success');

    // A flat file whose name disagrees with the claimed shard id fails closed.
    await writeFile(join(flatDir, 'shard-2.json'), JSON.stringify(receipts(m)[0]));
    assert.throws(execute, /Command failed/u);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
