import { UNIT_JOB_IDS, unitJobName, unitJobEnabled } from '../lib/unit-shards.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePrEvidence } from '../lib/ci-evidence.mjs';

test('an API failure requires the full suite', async () => {
  const result = await resolvePrEvidence({
    repository: 'owner/repo',
    sha: 'a'.repeat(40),
    api: async () => {
      throw new Error('API unavailable');
    },
  });
  assert.equal(result.mode, 'full');
  assert.match(result.reason, /API unavailable/u);
});

import { buildDeliveryManifest } from '../generate-delivery-manifest.mjs';
const sha = 'a'.repeat(40),
  base = 'b'.repeat(40),
  head = 'c'.repeat(40);
const tested = 'd'.repeat(40),
  tree = 'e'.repeat(40),
  repository = 'owner/repo';
const scope = {
  version: 1,
  base,
  head: tested,
  full: false,
  projects: ['web'],
  unit: ['web'],
  coverage: [],
  smoke: [],
  integration: [],
  boundary: [],
  perf: [],
  webFlow: true,
};
async function fixture() {
  const manifest = await buildDeliveryManifest({
    base,
    head: tested,
    event: 'pull_request',
    ref: 'refs/pull/12/merge',
    full: false,
    files: ['apps/web/src/App.vue'],
    scope,
  });
  const run = {
    id: 99,
    run_attempt: 1,
    head_sha: head,
    head_branch: 'feature',
    event: 'pull_request',
    path: '.github/workflows/ci.yml',
    workflow_id: 7,
    repository: { full_name: repository, fork: false },
    head_repository: { full_name: repository, fork: false },
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-10-19T00:00:00Z',
    updated_at: '2026-10-19T00:10:00Z',
  };
  const pr = {
    number: 12,
    merged: true,
    merge_commit_sha: sha,
    base: { ref: 'main', repo: { full_name: repository } },
    head: { sha: head, repo: { full_name: repository, fork: false } },
  };
  const expectedManifest = structuredClone(manifest);
  const evidence = {
    kind: 'ci-evidence-v1',
    runId: 99,
    runAttempt: 1,
    repository,
    testedCommit: tested,
    testedTree: tree,
    prHead: head,
    prNumber: 12,
    manifest,
    inputsDigest: 'f'.repeat(64),
  };
  const main = {
    sha,
    tree: { sha: tree },
    parents: [
      { sha: base, url: 'https://api.github.com/parent/base' },
      { sha: head, url: 'https://api.github.com/parent/head' },
    ],
  };
  const commit = {
    sha: tested,
    tree: { sha: tree },
    parents: [
      { sha: base, url: 'https://api.github.com/parent/base' },
      { sha: head, url: 'https://api.github.com/parent/head' },
    ],
  };
  const responses = new Map([
    [`/repos/${repository}/commits/${sha}/pulls?per_page=100`, [pr]],
    [`/repos/${repository}/pulls/12`, pr],
    [`/repos/${repository}/git/commits/${sha}`, main],
    [`/repos/${repository}/git/commits/${tested}`, commit],
    [`/repos/${repository}/actions/workflows/ci.yml`, { id: 7, path: '.github/workflows/ci.yml' }],
    [
      `/repos/${repository}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${head}&per_page=100`,
      { total_count: 1, workflow_runs: [run] },
    ],
    [`/repos/${repository}/actions/runs/99`, run],
    [
      `/repos/${repository}/actions/runs/99/attempts/1/jobs?per_page=100`,
      {
        total_count: 4,
        jobs: [
          { name: 'CI Check', head_sha: head, status: 'completed', conclusion: 'success' },
          ...UNIT_JOB_IDS.map((id) => ({
            name: unitJobName(id),
            head_sha: head,
            status: 'completed',
            conclusion: unitJobEnabled(manifest, id) ? 'success' : 'skipped',
          })),
        ],
      },
    ],
  ]);
  return {
    run,
    pr,
    evidence,
    main,
    commit,
    responses,
    options: {
      repository,
      sha,
      before: base,
      now: Date.parse('2026-10-19T00:20:00Z'),
      api: async (url) => {
        assert.ok(responses.has(url), url);
        return structuredClone(responses.get(url));
      },
      readEvidence: async () => structuredClone(evidence),
      gitCommit: async (value) => {
        const remote = structuredClone(value === sha ? main : commit);
        return { ...remote, parents: remote.parents.map(({ sha }) => ({ sha })) };
      },
      changedFiles: async () => ['apps/web/src/App.vue'],
      inputsDigest: async () => 'f'.repeat(64),
      regenerateManifest: async () => structuredClone(expectedManifest),
    },
  };
}

test('reuses the latest green same-repo PR run only after API, tree and manifest proof', async () => {
  const f = await fixture();
  const result = await resolvePrEvidence(f.options);
  assert.equal(result.mode, 'reuse');
  assert.equal(result.testRunId, 99);
  assert.equal(result.testedCommit, tested);
  assert.equal(result.testedTree, tree);
});

const mutations = {
  'tampered tree': (f) => {
    f.evidence.testedTree = '0'.repeat(40);
  },
  'different main tree': (f) => {
    f.main.tree.sha = '0'.repeat(40);
  },
  'failed CI': (f) => {
    f.run.conclusion = 'failure';
  },
  'cancelled CI': (f) => {
    f.run.conclusion = 'cancelled';
  },
  'stale CI': (f) => {
    f.run.created_at = '2026-10-01T00:00:00Z';
  },
  'wrong head SHA': (f) => {
    f.run.head_sha = base;
  },
  fork: (f) => {
    f.run.head_repository.fork = true;
  },
  'other repository': (f) => {
    f.run.repository.full_name = 'attacker/repo';
  },
  'other workflow': (f) => {
    f.run.path = '.github/workflows/evil.yml';
  },
  'wrong event': (f) => {
    f.run.event = 'workflow_dispatch';
  },
  'wrong tested SHA': (f) => {
    f.evidence.testedCommit = head;
  },
  'manifest digest mismatch': (f) => {
    f.evidence.manifest.digest = '0'.repeat(64);
  },
  'manifest content mismatch with valid self-digest': (f) => {
    f.evidence.manifest.risk.reasons = ['tampered workload'];
    delete f.evidence.manifest.digest;
    f.evidence.manifest.digest = digest(f.evidence.manifest);
  },
  'config digest mismatch': (f) => {
    f.evidence.inputsDigest = '0'.repeat(64);
  },
  'artifact digest mismatch': (f) => {
    f.options.readEvidence = async () => {
      throw new Error('artifact archive digest mismatch');
    };
  },
  'CI config change': (f) => {
    f.options.changedFiles = async () => ['.github/workflows/ci.yml'];
  },
  'base drift': (f) => {
    f.commit.parents[0].sha = sha;
  },
  'push spans more than one merge': (f) => {
    if (f.mainEvidence) f.mainEvidence.pushBefore = tested;
    else f.options.before = tested;
  },
  'direct push without PR': (f) => {
    f.responses.set(`/repos/${repository}/commits/${sha}/pulls?per_page=100`, []);
  },
  'multiple PRs': (f) => {
    f.responses.set(`/repos/${repository}/commits/${sha}/pulls?per_page=100`, [f.pr, f.pr]);
  },
  'missing evidence': (f) => {
    f.options.readEvidence = async () => null;
  },
  'previous run attempt': (f) => {
    f.evidence.runAttempt = 0;
  },
  'latest failed run shadows old success': (f) => {
    f.responses
      .get(
        `/repos/${repository}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${head}&per_page=100`,
      )
      .workflow_runs.push({ ...f.run, id: 100 });
    f.responses.get(
      `/repos/${repository}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${head}&per_page=100`,
    ).total_count = 2;
    f.responses.set(`/repos/${repository}/actions/runs/100`, {
      ...f.run,
      id: 100,
      conclusion: 'failure',
    });
  },
  'missing aggregate gate': (f) => {
    f.responses.set(`/repos/${repository}/actions/runs/99/attempts/1/jobs?per_page=100`, {
      total_count: 0,
      jobs: [],
    });
  },
  'API failure': (f) => {
    f.options.api = async () => {
      throw new Error('API error');
    };
  },
};
for (const [name, mutate] of Object.entries(mutations)) {
  test(`${name} fails closed to full suite`, async () => {
    const f = await fixture();
    mutate(f);
    assert.equal((await resolvePrEvidence(f.options)).mode, 'full');
  });
}

import { isCiInput } from '../lib/ci-evidence.mjs';
import { projectCommand } from '../lib/project-command.mjs';
test('CI inputs explicitly protect toolchain, workspace, dependencies, scripts and workflows', () => {
  for (const file of [
    '.github/prompts/help.md',
    'tools/build/shared.mjs',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.node-version',
    'nx.json',
    'apps/api/project.json',
    'apps/web/vite.config.ts',
    'apps/desktop/.python-version',
    'apps/api/pyproject.toml',
    'uv.lock',
    'Dockerfile.api',
    'docker-compose.local.yml',
  ])
    assert.equal(isCiInput(file), true, file);
  for (const file of [
    'apps/web/src/App.vue',
    'packages/task/src/task.ts',
    'docs/architecture/design.md',
  ])
    assert.equal(isCiInput(file), false, file);
});
test('full audit executes all projects; PR affected execution and non-Nx commands retain their semantics', () => {
  const args = ['exec', 'nx', 'affected', '-t', 'test', '--exclude=memoflow'];
  assert.deepEqual(projectCommand('pnpm', args, true).args, [
    'exec',
    'nx',
    'run-many',
    '-t',
    'test',
    '--exclude=memoflow',
  ]);
  assert.deepEqual(projectCommand('pnpm', args, false).args, args);
  assert.deepEqual(projectCommand('node', ['test.mjs'], true), {
    command: 'node',
    args: ['test.mjs'],
  });
});

import { verifyPromotionEvidence, verifyCandidateRun } from '../lib/promotion-evidence.mjs';
import { digest } from '../lib/contracts.mjs';
async function promotionFixture() {
  const f = await fixture();
  const proof = await resolvePrEvidence(f.options);
  const mainRun = {
    ...f.run,
    id: 101,
    event: 'push',
    head_sha: sha,
    head_branch: 'main',
    created_at: '2026-10-19T00:20:00Z',
  };
  f.responses.set(`/repos/${repository}/actions/runs/101`, mainRun);
  f.responses.set(`/repos/${repository}/actions/runs/101/attempts/1/jobs?per_page=100`, {
    total_count: 4,
    jobs: [
      { name: 'CI Check', head_sha: sha, status: 'completed', conclusion: 'success' },
      ...UNIT_JOB_IDS.map((id) => ({
        name: unitJobName(id),
        head_sha: sha,
        status: 'completed',
        conclusion: 'skipped',
      })),
    ],
  });
  const manifest = structuredClone(f.evidence.manifest);
  Object.assign(manifest, {
    commit: sha,
    head: sha,
    event: 'push',
    execution: { ...proof, candidate: true },
    scope: { ...scope, head: sha },
    lanes: Object.fromEntries(Object.keys(manifest.lanes).map((lane) => [lane, false])),
  });
  delete manifest.digest;
  manifest.digest = digest(manifest);
  const mainEvidence = { ...f.evidence, runId: 101, testedCommit: sha, pushBefore: base, manifest };
  f.options.readEvidence = async (run) =>
    structuredClone(run.id === 101 ? mainEvidence : f.evidence);
  f.options.runId = 101;
  f.options.artifact = async () => ({ id: 123, digest: `sha256:${'f'.repeat(64)}` });
  return { ...f, mainEvidence, mainRun };
}
test('promotion verifies PR test evidence and binds the exact main build archive digest', async () => {
  const f = await promotionFixture();
  const result = await verifyPromotionEvidence(f.options);
  assert.equal(result.testEvidence.testRunId, 99);
  assert.equal(result.tree, tree);
  assert.equal(result.buildArtifactDigest, `sha256:${'f'.repeat(64)}`);
});
for (const [name, mutate] of Object.entries(mutations)) {
  test(`promotion blocks ${name}`, async () => {
    const f = await promotionFixture();
    mutate(f);
    await assert.rejects(verifyPromotionEvidence(f.options));
  });
}
test('promotion accepts exhaustive main fallback evidence without inventing a PR proof', async () => {
  const f = await promotionFixture();
  const manifest = f.mainEvidence.manifest;
  Object.assign(manifest, {
    full: true,
    execution: { mode: 'full', candidate: true, reason: 'no PR' },
  });
  for (const job of f.responses.get(
    `/repos/${repository}/actions/runs/101/attempts/1/jobs?per_page=100`,
  ).jobs) {
    if (job.name === 'CI Check' || job.name === unitJobName('unit-1')) job.conclusion = 'success';
  }
  manifest.scope.full = true;
  manifest.lanes = Object.fromEntries(Object.keys(manifest.lanes).map((lane) => [lane, true]));
  delete manifest.digest;
  manifest.digest = digest(manifest);
  assert.equal((await verifyPromotionEvidence(f.options)).testEvidence.testRunId, 101);
});
for (const mutation of [
  'artifact digest',
  'main tree',
  'main manifest digest',
  'docs-only',
  'main failed',
  'main fork',
  'main workflow',
]) {
  test(`promotion blocks ${mutation}`, async () => {
    const f = await promotionFixture();
    if (mutation === 'artifact digest')
      f.options.artifact = async () => ({ id: 123, digest: 'tampered' });
    if (mutation === 'main tree') f.mainEvidence.testedTree = base;
    if (mutation === 'main manifest digest') f.mainEvidence.manifest.digest = '0'.repeat(64);
    if (mutation === 'docs-only') {
      f.mainEvidence.manifest.execution.candidate = false;
      delete f.mainEvidence.manifest.digest;
      f.mainEvidence.manifest.digest = digest(f.mainEvidence.manifest);
    }
    if (mutation === 'main failed') f.mainRun.conclusion = 'failure';
    if (mutation === 'main fork') f.mainRun.repository.fork = true;
    if (mutation === 'main workflow') f.mainRun.path = '.github/workflows/other.yml';
    await assert.rejects(verifyPromotionEvidence(f.options));
  });
}
test('candidate API identity must be verified before consuming its manifest', async () => {
  const f = await fixture();
  const run = {
    ...f.run,
    id: 123,
    head_sha: sha,
    head_branch: 'main',
    event: 'workflow_run',
    path: '.github/workflows/candidate-publish.yml',
    workflow_id: 8,
  };
  f.responses.set(`/repos/${repository}/actions/runs/123`, run);
  f.responses.set(`/repos/${repository}/actions/workflows/candidate-publish.yml`, {
    id: 8,
    path: run.path,
  });
  assert.equal((await verifyCandidateRun({ ...f.options, runId: 123 })).id, 123);
  run.head_repository.fork = true;
  await assert.rejects(verifyCandidateRun({ ...f.options, runId: 123 }));
});

import { createHash } from 'node:crypto';
import { verifyArchiveDigest } from '../lib/github-evidence.mjs';
test('artifact bytes must match the API digest, including same-format digest tampering', () => {
  const bytes = Buffer.from('trusted archive');
  const expected = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  assert.doesNotThrow(() => verifyArchiveDigest(bytes, expected));
  assert.throws(
    () => verifyArchiveDigest(Buffer.from('tampered archive'), expected),
    /digest mismatch/u,
  );
  assert.throws(() => verifyArchiveDigest(bytes, `sha256:${'0'.repeat(64)}`), /digest mismatch/u);
});

import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLaneInput } from '../create-lane-input.mjs';
test('reuse permits a build-only contract while keeping disabled ordinary lanes forbidden', async () => {
  const f = await promotionFixture();
  const temporary = await mkdtemp(path.join(tmpdir(), 'reuse-lane-'));
  try {
    const input = await createLaneInput({
      lane: 'validate',
      manifest: f.mainEvidence.manifest,
      output: path.join(temporary, 'input.json'),
    });
    assert.equal(input.policy.execution, 'build-only');
    await assert.rejects(
      createLaneInput({
        lane: 'coverage',
        manifest: f.mainEvidence.manifest,
        output: path.join(temporary, 'forbidden.json'),
      }),
      /not enabled/u,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

import { execFileSync } from 'node:child_process';
import { githubEvidenceClient } from '../lib/github-evidence.mjs';
test('artifact adapter authenticates metadata and checks archive bytes before reading JSON', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'evidence-api-'));
  try {
    const file = path.join(temporary, 'ci-evidence-v1.json');
    await writeFile(file, JSON.stringify({ kind: 'ci-evidence-v1', testedCommit: tested }));
    const archive = path.join(temporary, 'evidence.zip');
    execFileSync('zip', ['-jq', archive, file], { timeout: 10_000 });
    const bytes = await readFile(archive);
    const metadata = {
      id: 123,
      name: 'ci-evidence-v1',
      expired: false,
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      workflow_run: { id: 99, head_sha: head },
    };
    let corruptBytes = false;
    const routes = [];
    const client = githubEvidenceClient({
      repository,
      token: 'fake-test-token',
      fetchImplementation: async (url, options) => {
        routes.push(url);
        assert.equal(options.headers.Authorization, 'Bearer fake-test-token');
        if (url.endsWith('/actions/runs/99/artifacts?per_page=100'))
          return Response.json({ total_count: 1, artifacts: [metadata] });
        assert.equal(url, `https://api.github.com/repos/${repository}/actions/artifacts/123/zip`);
        return new Response(corruptBytes ? Buffer.from('tampered') : bytes);
      },
    });
    const run = { id: 99, head_sha: head };
    assert.equal((await client.readEvidence(run)).testedCommit, tested);
    assert.equal(routes.length, 2);
    corruptBytes = true;
    await assert.rejects(client.readEvidence(run), /archive digest mismatch/u);
    corruptBytes = false;
    metadata.workflow_run.id = 100;
    const before = routes.length;
    await assert.rejects(client.readEvidence(run), /identity/u);
    assert.equal(routes.length, before + 1, 'wrong-run archive must never be downloaded');
    metadata.workflow_run.id = 99;
    metadata.expired = true;
    await assert.rejects(client.readEvidence(run), /identity/u);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

import { candidateRequired } from '../lib/ci-evidence.mjs';
test('docs-only push cannot produce Candidate, while unprovable push ranges cannot authorize Candidate', async () => {
  assert.equal(
    await candidateRequired({ before: base, sha, changedFiles: async () => ['docs/design.md'] }),
    false,
  );
  assert.equal(
    await candidateRequired({
      before: base,
      sha,
      changedFiles: async () => ['apps/web/src/App.vue'],
    }),
    true,
  );
  assert.equal(
    await candidateRequired({ before: '0'.repeat(40), sha, changedFiles: async () => [] }),
    false,
  );
  assert.equal(
    await candidateRequired({
      before: base,
      sha,
      changedFiles: async () => {
        throw new Error('unreachable old force-push SHA');
      },
    }),
    false,
  );
});

import { verifyCandidateChain } from '../lib/promotion-evidence.mjs';
test('promotion blocks valid-format build artifact and manifest digest drift from the recorded candidate chain', async () => {
  const f = await promotionFixture();
  const chain = await verifyPromotionEvidence(f.options);
  const candidate = {
    gitSha: sha,
    ciRunId: String(chain.ciRunId),
    deliveryManifestDigest: `sha256:${chain.deliveryManifestDigest}`,
    ciEvidence: structuredClone(chain),
  };
  assert.doesNotThrow(() => verifyCandidateChain(candidate, chain));
  f.options.artifact = async () => ({ id: 123, digest: `sha256:${'0'.repeat(64)}` });
  const drifted = await verifyPromotionEvidence(f.options);
  assert.throws(() => verifyCandidateChain(candidate, drifted), /chain mismatch/u);
  assert.throws(
    () => verifyCandidateChain(candidate, { ...chain, deliveryManifestDigest: '0'.repeat(64) }),
    /chain mismatch/u,
  );
});

for (const status of ['missing', 'failure', 'cancelled', 'skipped', 'duplicate']) {
  test(`PR reuse rejects a ${status} Unit shard even with a green aggregate check`, async () => {
    const f = await fixture();
    const response = f.responses.get(
      `/repos/${repository}/actions/runs/99/attempts/1/jobs?per_page=100`,
    );
    const job = response.jobs.find((job) => job.name === unitJobName('unit-1'));
    if (status === 'missing') response.jobs = response.jobs.filter((entry) => entry !== job);
    else if (status === 'duplicate') response.jobs.push(structuredClone(job));
    else job.conclusion = status;
    response.total_count = response.jobs.length;
    const result = await resolvePrEvidence(f.options);
    assert.equal(result.mode, 'full');
    assert.match(result.reason, /unit-1 missing, ambiguous or not success/u);
  });

  test(`promotion rejects a ${status} required Unit shard in main full audit`, async () => {
    const f = await promotionFixture();
    const manifest = f.mainEvidence.manifest;
    manifest.full = true;
    manifest.scope.full = true;
    manifest.execution = { mode: 'full', candidate: true };
    manifest.lanes = Object.fromEntries(Object.keys(manifest.lanes).map((lane) => [lane, true]));
    delete manifest.digest;
    manifest.digest = digest(manifest);
    const response = f.responses.get(
      `/repos/${repository}/actions/runs/101/attempts/1/jobs?per_page=100`,
    );
    const job = response.jobs.find((job) => job.name === unitJobName('unit-1'));
    job.conclusion = 'success';
    if (status === 'missing') response.jobs = response.jobs.filter((entry) => entry !== job);
    else if (status === 'duplicate') response.jobs.push(structuredClone(job));
    else job.conclusion = status;
    response.total_count = response.jobs.length;
    await assert.rejects(
      verifyPromotionEvidence(f.options),
      /unit-1 missing, ambiguous or not success/u,
    );
  });
}
