import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import lifecycle from '../lib/release-lifecycle.cjs';
import { prepareReleaseSource } from '../release-tools/prepare-release-source.mjs';
import { finalizeReleaseChannel } from '../release-tools/finalize-release-channel.mjs';
import { createCandidateSet, candidateSetDigest } from '../candidate-manifest.mjs';
import {
  createAncestry,
  installCompareRoutes,
  compareUrl,
  httpError,
} from './helpers/octokit-routes.mjs';

const SHA = 'a'.repeat(40),
  OTHER = 'b'.repeat(40),
  ROOT = 'e'.repeat(40),
  TAG = 'v1.4.2-nightly.20261026.9';
const coordinates = { owner: 'owner', repo: 'repo' };
const ci = {
  id: 5,
  head_sha: SHA,
  head_branch: 'main',
  event: 'push',
  path: '.github/workflows/ci.yml',
  status: 'completed',
  conclusion: 'success',
};
const run = {
  id: 9,
  head_sha: SHA,
  head_branch: 'main',
  event: 'schedule',
  path: '.github/workflows/nightly-release.yml',
  status: 'completed',
  conclusion: 'success',
  repository: { full_name: 'owner/repo', fork: false },
  head_repository: { full_name: 'owner/repo', fork: false },
};
const encode = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
function fixture(change = () => {}) {
  const native = Buffer.from('native test artifact');
  const platforms = Object.fromEntries(
    ['windows-x64', 'linux-x64', 'macos-x64', 'macos-arm64'].map((p) => [
      p,
      { runtimeValidation: { status: 'passed' } },
    ]),
  );
  const distributions = {
    china: { repository: 'registry/owner/image', digest: 'sha256:' + 'd'.repeat(64) },
    global: { repository: 'ghcr.io/owner/image', digest: 'sha256:' + 'd'.repeat(64) },
  };
  const images = Object.fromEntries(
    ['api', 'web', 'migrator'].map((p) => [
      p,
      { digest: 'sha256:' + 'd'.repeat(64), distributions: structuredClone(distributions) },
    ]),
  );
  const state = {
    sha: SHA,
    mainSha: SHA,
    tag: TAG,
    version: '1.4.2',
    ci: structuredClone(ci),
    run: structuredClone(run),
    // SHA sits on main; OTHER shares only the root commit, so pointing main at
    // OTHER makes the source comparison diverged instead of identical.
    ancestry: createAncestry({
      chains: [
        [ROOT, SHA],
        [ROOT, OTHER],
      ],
    }),
    jobs: [{ name: 'CI Check', status: 'completed', conclusion: 'success' }],
    desktop: {
      kind: 'desktop-release',
      gitSha: SHA,
      tag: TAG,
      platforms,
      assets: [
        { name: 'native.zip', size: native.length, sha256: lifecycle.hash(native).slice(7) },
      ],
    },
    candidate: {
      gitSha: SHA,
      ciRunId: 5,
      digest: 'sha256:' + 'c'.repeat(64),
      images: structuredClone(images),
    },
    docker: { kind: 'docker-release', gitSha: SHA, tag: TAG, images: structuredClone(images) },
    release: {
      kind: 'memoflow-release',
      channel: 'nightly',
      gitSha: SHA,
      tag: TAG,
      version: TAG.slice(1),
      ciRunId: 5,
      candidateSet: { digest: 'sha256:' + 'c'.repeat(64) },
      postflight: { status: 'passed' },
      updateFeedArchive: {
        name: 'desktop-update-feed.tar.gz',
        digest: 'sha256:' + 'f'.repeat(64),
        size: 300,
        channel: 'nightly',
      },
      qualityReceipt: {
        kind: 'release-quality-receipt',
        schemaVersion: 1,
        gitSha: SHA,
        runId: 9,
        runAttempt: 1,
        status: 'passed',
        web: 'passed',
        provider: 'passed',
      },
    },
    nightly: {
      kind: 'memoflow-nightly',
      schemaVersion: 1,
      channel: 'nightly',
      tag: TAG,
      sourceVersion: '1.4.2',
      gitSha: SHA,
      ciRunId: 5,
      runId: 9,
      runAttempt: 1,
      runtimeArtifact: { digest: 'sha256:' + 'e'.repeat(64) },
      quality: { status: 'passed', desktop: 'passed', images: 'passed', acceptance: 'passed' },
    },
    extraReleases: [],
    existingTagSha: undefined,
    releaseDraft: false,
    prerelease: true,
    actions: [],
    assetCorrupt: false,
  };
  change(state);
  const data = {
    'release-manifest.json': state.release,
    'candidate-set-v1.json': state.candidate,
    'desktop-release-manifest.json': state.desktop,
    'docker-release-manifest.json': state.docker,
  };
  const binary = new Map(),
    assets = [];
  let next = 1;
  for (const [name, value] of Object.entries(data)) {
    const body = encode(value);
    binary.set(next, body);
    assets.push({ id: next++, name, size: body.length, digest: lifecycle.hash(body) });
  }
  state.nightly.evidence = Object.fromEntries(assets.map((a) => [a.name, a.digest]));
  const body = encode(state.nightly);
  binary.set(next, body);
  assets.push({
    id: next++,
    name: 'nightly-manifest.json',
    size: body.length,
    digest: lifecycle.hash(body),
  });
  assets.push({
    id: next,
    name: 'native.zip',
    size: native.length,
    digest: lifecycle.hash(native),
  });
  binary.set(next, native);
  assets.push({
    id: 99,
    name: 'desktop-update-feed.tar.gz',
    digest: 'sha256:' + 'f'.repeat(64),
    size: 300,
  });
  const metadata = {
    id: 20,
    tag_name: TAG,
    draft: state.releaseDraft,
    prerelease: state.prerelease,
    assets,
  };
  const github = {
    rest: {
      repos: {
        listReleases: () => {},
        getContent: async ({ path }) => ({
          data: {
            encoding: 'base64',
            content: Buffer.from(
              JSON.stringify(
                path === '.release-please-manifest.json'
                  ? { '.': state.version }
                  : { version: state.version },
              ),
            ).toString('base64'),
          },
        }),
        getBranch: async () => ({ data: { commit: { sha: state.mainSha } } }),
        getReleaseAsset: async ({ asset_id }) => ({
          data: state.assetCorrupt ? Buffer.from('tampered') : binary.get(asset_id),
        }),
        createRelease: async (args) => {
          state.actions.push(args);
          return { data: { ...args, id: 44 } };
        },
      },
      git: {
        getRef: async ({ ref }) => {
          if (ref === 'tags/' + TAG)
            return { data: { object: { type: 'commit', sha: state.sha } } };
          if (state.existingTagSha)
            return { data: { object: { type: 'commit', sha: state.existingTagSha } } };
          throw Object.assign(new Error('missing'), { status: 404 });
        },
        createRef: async (args) => {
          state.actions.push(args);
          return { data: { object: { sha: args.sha } } };
        },
      },
      actions: {
        getWorkflowRun: async ({ run_id }) => ({ data: run_id === 9 ? state.run : state.ci }),
        listWorkflowRuns: () => {},
        listJobsForWorkflowRun: () => {},
      },
    },
    paginate: async (method) => {
      if (method === github.rest.repos.listReleases) return [metadata, ...state.extraReleases];
      if (method === github.rest.actions.listWorkflowRuns) return [state.ci];
      if (method === github.rest.actions.listJobsForWorkflowRun) return state.jobs;
      throw Error('unexpected API');
    },
  };
  const compareCalls = installCompareRoutes(github.rest.repos, { ancestry: state.ancestry });
  return { state, github, metadata, data, compareCalls };
}
const verify = (f) =>
  lifecycle.verifyPublishedNightly({ github: f.github, ...coordinates, tag: TAG });

const HEAD_SHA = 'd'.repeat(40),
  SIDE_SHA = 'f'.repeat(40);
// main: ROOT -> SHA -> HEAD_SHA; a sibling branch leaves the root at ROOT.
const MAIN_CHAINS = [
  [ROOT, SHA, HEAD_SHA],
  [ROOT, SIDE_SHA],
];

function mainCiHarness({ sha = SHA, mainSha = SHA, chains = MAIN_CHAINS, errors = {} } = {}) {
  const calls = [];
  const repos = {};
  installCompareRoutes(repos, { ancestry: createAncestry({ chains }), errors, calls });
  const github = {
    rest: {
      repos: {
        getBranch: async () => ({ data: { commit: { sha: mainSha } } }),
        ...repos,
      },
      actions: { getWorkflowRun: async () => ({ data: { ...ci, head_sha: sha } }) },
    },
    paginate: async (method) =>
      method === github.rest.actions.listJobsForWorkflowRun
        ? [{ name: 'CI Check', status: 'completed', conclusion: 'success' }]
        : [],
  };
  return { github, calls };
}

test('main CI ancestry gate issues GET /repos/{owner}/{repo}/compare/{base}...{head}', async () => {
  for (const [name, sha, mainSha] of [
    ['identical', SHA, SHA],
    ['ahead', SHA, HEAD_SHA],
  ]) {
    const h = mainCiHarness({ sha, mainSha });
    await lifecycle.verifyMainCi(h.github, coordinates, sha, 5);
    assert.equal(h.calls.length, 1, name);
    const [call] = h.calls;
    assert.equal(call.adapter, 'compareCommitsWithBasehead', name);
    assert.equal(call.method, 'GET', name);
    assert.deepEqual(call.missing, [], name);
    assert.equal(call.url, compareUrl('owner', 'repo', sha, mainSha), name);
  }
});

test('main CI ancestry gate rejects behind, diverged and unknown commits without relaxing the check', async () => {
  for (const [name, sha, mainSha] of [
    ['behind', HEAD_SHA, SHA],
    ['diverged', SIDE_SHA, SHA],
  ]) {
    const h = mainCiHarness({ sha, mainSha });
    await assert.rejects(
      () => lifecycle.verifyMainCi(h.github, coordinates, sha, 5),
      /source is not an ancestor of main/u,
      name,
    );
    assert.equal(h.calls[0].url, compareUrl('owner', 'repo', sha, mainSha), name);
  }
  const missing = mainCiHarness({ sha: '9'.repeat(40), mainSha: SHA });
  await assert.rejects(
    () => lifecycle.verifyMainCi(missing.github, coordinates, '9'.repeat(40), 5),
    {
      status: 404,
    },
  );
});

test('main CI ancestry gate propagates 403 and 429 instead of degrading to eligible', async () => {
  for (const status of [403, 429]) {
    const h = mainCiHarness({ errors: { compareCommitsWithBasehead: httpError(status) } });
    await assert.rejects(() => lifecycle.verifyMainCi(h.github, coordinates, SHA, 5), { status });
  }
});

test('main CI ancestry gate compares against the main SHA it just observed', async () => {
  const h = mainCiHarness({ sha: SHA, mainSha: HEAD_SHA });
  await lifecycle.verifyMainCi(h.github, coordinates, SHA, 5);
  assert.equal(h.calls[0].url, compareUrl('owner', 'repo', SHA, HEAD_SHA));
  assert.equal(h.calls[0].params.basehead, SHA + '...' + HEAD_SHA);
});

test('invalid source SHA never reaches the compare endpoint', async () => {
  const h = mainCiHarness();
  for (const sha of ['deadbeef', 'A'.repeat(40), SHA + '0']) {
    await assert.rejects(
      () => lifecycle.verifyMainCi(h.github, coordinates, sha, 5),
      /full immutable source SHA required/u,
    );
  }
  assert.equal(h.calls.length, 0);
});

test('published Nightly verifies source, native platforms, OCI parity, API hashes and successful run', async () => {
  const f = fixture();
  const result = await verify(f);
  assert.equal(result.sha, SHA);
  assert.equal(result.version, '1.4.2');
  assert.match(result.manifestDigest, /^sha256:/u);
});
test('published Nightly accepts an acceptance receipt recorded by an earlier attempt of its publication run', async () => {
  const f = fixture((s) => {
    s.nightly.runAttempt = 2;
    s.release.qualityReceipt.runAttempt = 1;
  });
  const result = await verify(f);
  assert.equal(result.nightly.runAttempt, 2);
  assert.equal(result.nightly.quality.acceptance, 'passed');
});
for (const [name, mutate, pattern] of [
  [
    'draft',
    (s) => {
      s.releaseDraft = true;
    },
    /published/u,
  ],
  [
    'not prerelease',
    (s) => {
      s.prerelease = false;
    },
    /prerelease/u,
  ],
  [
    'wrong immutable tag',
    (s) => {
      s.sha = OTHER;
    },
    /identity mismatch/u,
  ],
  [
    'failed publication',
    (s) => {
      s.run.conclusion = 'failure';
    },
    /failed Nightly/u,
  ],
  [
    'wrong workflow',
    (s) => {
      s.run.path = '.github/workflows/ci.yml';
    },
    /Nightly publication run/u,
  ],
  [
    'fork source',
    (s) => {
      s.run.head_repository.fork = true;
    },
    /canonical repository/u,
  ],
  [
    'foreign repository',
    (s) => {
      s.run.repository.full_name = 'attacker/repo';
    },
    /canonical repository/u,
  ],
  [
    'missing platform',
    (s) => {
      delete s.desktop.platforms['macos-arm64'];
    },
    /native runtime proof/u,
  ],
  [
    'native smoke failed',
    (s) => {
      s.desktop.platforms['linux-x64'].runtimeValidation.status = 'failed';
    },
    /native runtime proof/u,
  ],
  [
    'wrong image digest',
    (s) => {
      s.docker.images.api.digest = 'sha256:' + 'f'.repeat(64);
    },
    /image identity/u,
  ],
  [
    'registry mismatch',
    (s) => {
      s.docker.images.api.distributions.global.digest = 'sha256:' + 'f'.repeat(64);
    },
    /registry parity/u,
  ],
  [
    'failed quality',
    (s) => {
      s.nightly.quality.acceptance = 'failed';
    },
    /quality/u,
  ],
  [
    'foreign acceptance run',
    (s) => {
      s.release.qualityReceipt.runId = 19;
    },
    /acceptance receipt/u,
  ],
  [
    'acceptance from a future attempt',
    (s) => {
      s.release.qualityReceipt.runAttempt = 2;
    },
    /acceptance receipt/u,
  ],
  [
    'missing acceptance receipt',
    (s) => {
      delete s.release.qualityReceipt;
    },
    /acceptance receipt/u,
  ],
  [
    'bad main run',
    (s) => {
      s.ci.head_sha = OTHER;
    },
    /exact-SHA main CI/u,
  ],
  [
    'skipped main Check',
    (s) => {
      s.jobs[0].conclusion = 'skipped';
    },
    /required Check/u,
  ],
  [
    'duplicate main Check',
    (s) => {
      s.jobs.push({ ...s.jobs[0] });
    },
    /required Check/u,
  ],
  [
    'source not on main',
    (s) => {
      s.mainSha = OTHER;
    },
    /ancestor/u,
  ],
  [
    'version drift',
    (s) => {
      s.version = '1.4.3';
    },
    /Release Please source/u,
  ],
  [
    'corrupt evidence bytes',
    (s) => {
      s.assetCorrupt = true;
    },
    /digest mismatch/u,
  ],
]) {
  test('Nightly promotion fails closed: ' + name, async () => {
    await assert.rejects(() => verify(fixture(mutate)), pattern);
  });
}
test('binary artifact deletion or replacement blocks promotion', async () => {
  for (const mode of ['missing', 'digest', 'size']) {
    const f = fixture();
    const b = f.metadata.assets.find((a) => a.name === 'native.zip');
    if (mode === 'missing') f.metadata.assets = f.metadata.assets.filter((a) => a !== b);
    if (mode === 'digest') b.digest = 'sha256:' + '0'.repeat(64);
    if (mode === 'size') b.size += 1;
    await assert.rejects(() => verify(f), /native asset changed/u);
  }
});
test('Stable selects an older validated Nightly at identical SHA without a new commit', async () => {
  const f = fixture();
  const p = await lifecycle.resolveReleasePlan({
    github: f.github,
    ...coordinates,
    channel: 'stable',
    nightlyTag: TAG,
  });
  assert.equal(p.sha, SHA);
  assert.equal(p.tag, 'v1.4.2');
  assert.equal(p.source_nightly, TAG);
  assert.equal(p.ci_run_id, 5);
  assert.equal(p.eligible, true);
});
test('Stable rejects published version downgrade', async () => {
  const f = fixture((s) =>
    s.extraReleases.push({ tag_name: 'v2.0.0', draft: false, prerelease: false }),
  );
  await assert.rejects(
    () =>
      lifecycle.resolveReleasePlan({
        github: f.github,
        ...coordinates,
        channel: 'stable',
        nightlyTag: TAG,
      }),
    /cannot downgrade/u,
  );
});
test('Stable refuses an existing immutable tag pointing to another SHA', async () => {
  const f = fixture((s) => {
    s.extraReleases.push({ tag_name: 'v1.4.2', draft: true, prerelease: false });
    s.existingTagSha = OTHER;
  });
  await assert.rejects(
    () => lifecycle.resolveReleasePlan({ github: f.github, ...coordinates, nightlyTag: TAG }),
    /tag collision/u,
  );
});
test('already published same-SHA Stable is an idempotent no-op', async () => {
  const f = fixture((s) => {
    s.extraReleases.push({ tag_name: 'v1.4.2', draft: false, prerelease: false });
    s.existingTagSha = SHA;
  });
  const p = await lifecycle.resolveReleasePlan({
    github: f.github,
    ...coordinates,
    nightlyTag: TAG,
  });
  assert.equal(p.eligible, false);
  assert.equal(p.already_published, true);
});
test('draft creation is immutable and resumes only draft assets', async () => {
  const f = fixture();
  await lifecycle.ensureDraft({
    github: f.github,
    ...coordinates,
    tag: 'v1.4.2',
    sha: SHA,
    channel: 'stable',
  });
  assert.equal(f.state.actions[0].ref, 'refs/tags/v1.4.2');
  assert.equal(f.state.actions[1].draft, true);
  assert.equal(f.state.actions[1].prerelease, false);
  await assert.rejects(
    () =>
      lifecycle.ensureDraft({
        github: f.github,
        ...coordinates,
        tag: TAG,
        sha: SHA,
        channel: 'nightly',
      }),
    /published releases are immutable/u,
  );
});
test('Nightly packaging overlay changes only package metadata and never Release Please authority', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'release-overlay-'));
  try {
    await mkdir(path.join(root, 'apps/desktop'), { recursive: true });
    for (const file of ['package.json', 'apps/desktop/package.json'])
      await writeFile(path.join(root, file), JSON.stringify({ version: '1.4.2' }));
    await writeFile(
      path.join(root, '.release-please-manifest.json'),
      JSON.stringify({ '.': '1.4.2' }),
    );
    await writeFile(path.join(root, 'CHANGELOG.md'), '## [1.4.2]\n');
    const stable = await prepareReleaseSource({
      root,
      tag: 'v1.4.2',
      channel: 'stable',
      apply: true,
    });
    assert.equal(stable.overlay, false);
    await prepareReleaseSource({ root, tag: TAG, channel: 'nightly', apply: true });
    assert.equal(
      JSON.parse(await readFile(path.join(root, 'apps/desktop/package.json'))).version,
      TAG.slice(1),
    );
    assert.equal(
      JSON.parse(await readFile(path.join(root, '.release-please-manifest.json')))['.'],
      '1.4.2',
    );
    await assert.rejects(
      () => prepareReleaseSource({ root, tag: 'v1.4.3', channel: 'stable' }),
      /drift/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('finalization binds native and image evidence to this run and its acceptance receipt', async () => {
  const f = fixture();
  const root = await mkdtemp(path.join(tmpdir(), 'release-final-'));
  try {
    const main = path.join(root, 'release-manifest.json');
    for (const [name, value] of Object.entries(f.data))
      await writeFile(path.join(root, name), encode(value));
    await writeFile(path.join(root, 'github-release.json'), encode(f.metadata));
    const q = {
      kind: 'release-quality-receipt',
      schemaVersion: 1,
      gitSha: SHA,
      status: 'passed',
      web: 'passed',
      provider: 'passed',
      runId: 9,
      runAttempt: 1,
    };
    await writeFile(path.join(root, 'release-quality-receipt.json'), encode(q));
    const n = await finalizeReleaseChannel({
      manifestPath: main,
      evidenceRoot: root,
      channel: 'nightly',
      runId: 9,
      runAttempt: 1,
      runtimeDigest: 'sha256:' + 'e'.repeat(64),
    });
    assert.equal(n.evidence['release-manifest.json'], lifecycle.hash(await readFile(main)));
    q.runId = 8;
    await writeFile(path.join(root, 'release-quality-receipt.json'), encode(q));
    await assert.rejects(
      () =>
        finalizeReleaseChannel({
          manifestPath: main,
          evidenceRoot: root,
          channel: 'nightly',
          runId: 9,
          runAttempt: 1,
        }),
      /acceptance receipt identity/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('finalization binds the acceptance receipt to the publication run and source, not to the attempt', async () => {
  const f = fixture();
  const root = await mkdtemp(path.join(tmpdir(), 'release-attempt-'));
  const manifestPath = path.join(root, 'release-manifest.json');
  const receiptPath = path.join(root, 'release-quality-receipt.json');
  const receipt = {
    kind: 'release-quality-receipt',
    schemaVersion: 1,
    gitSha: SHA,
    status: 'passed',
    web: 'passed',
    provider: 'passed',
    runId: 9,
    runAttempt: 1,
  };
  const reset = async (quality) => {
    for (const [name, value] of Object.entries(f.data))
      await writeFile(path.join(root, name), encode(value));
    await writeFile(path.join(root, 'github-release.json'), encode(f.metadata));
    await writeFile(receiptPath, encode(quality));
  };
  const finalize = (runId = 9, runAttempt = 2) =>
    finalizeReleaseChannel({
      manifestPath,
      evidenceRoot: root,
      channel: 'nightly',
      runId,
      runAttempt,
      runtimeDigest: 'sha256:' + 'e'.repeat(64),
    });
  try {
    // (a) attempt 1 receipt + attempt 2 finalize of the same run is a legitimate recovery.
    await reset(receipt);
    const nightly = await finalize(9, 2);
    assert.equal(nightly.runId, 9);
    assert.equal(nightly.runAttempt, 2);
    const published = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(published.publication.runId, 9);
    assert.equal(published.publication.runAttempt, 2);
    assert.equal(published.qualityReceipt.runAttempt, 1);
    // (b) a receipt from another run stays foreign even at the same source.
    await reset({ ...receipt, runId: 8 });
    await assert.rejects(() => finalize(9, 2), /acceptance receipt identity/u);
    // (c) the same run id at another source is still rejected.
    await reset({ ...receipt, gitSha: OTHER });
    await assert.rejects(() => finalize(9, 2), /acceptance receipt identity/u);
    // (d) a failed acceptance can never finalize.
    await reset({ ...receipt, status: 'failed' });
    await assert.rejects(() => finalize(9, 2), /acceptance receipt identity/u);
    // (e) provenance cannot claim an attempt this run has not reached.
    await reset({ ...receipt, runAttempt: 3 });
    await assert.rejects(() => finalize(9, 2), /acceptance receipt identity/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Nightly finalization accepts the producer candidate set and keeps a strict numeric CI identity', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'release-numeric-ci-'));
  const digestFor = (char) => `sha256:${char.repeat(64)}`;
  const image = (component, char) => ({
    tag: `sha-${SHA}`,
    revision: SHA,
    digest: digestFor(char),
    distributions: {
      china: {
        repository: `registry.test/memoflow-${component}`,
        tag: `sha-${SHA}`,
        digest: digestFor(char),
      },
      global: {
        repository: `ghcr.io/owner/memoflow-${component}`,
        tag: `sha-${SHA}`,
        digest: digestFor(char),
      },
    },
  });
  // candidate-publish.yml hands the run id to the producer as a `jq --arg` string.
  const candidate = createCandidateSet({
    gitSha: SHA,
    ciRunId: '5',
    deliveryManifestDigest: digestFor('d'),
    ciEvidence: {
      kind: 'ci-chain-v1',
      commit: SHA,
      tree: 'e'.repeat(40),
      ciRunId: 5,
      deliveryManifestDigest: 'd'.repeat(64),
      testEvidence: { testRunId: 5, testedCommit: SHA, testedTree: 'e'.repeat(40) },
      buildArtifactId: 123,
      buildArtifactDigest: digestFor('f'),
    },
    images: { web: image('web', '1'), api: image('api', '2'), migrator: image('migrator', '3') },
    generatedAt: '2026-10-29T00:00:00.000Z',
  });
  assert.equal(typeof candidate.ciRunId, 'number');
  const release = () => ({
    schemaVersion: 2,
    kind: 'memoflow-release',
    version: '1.4.2',
    tag: TAG,
    gitSha: SHA,
    ciRunId: 5,
    deliveryManifestDigest: candidate.deliveryManifestDigest,
    candidateSet: { digest: candidate.digest },
    postflight: { status: 'passed' },
  });
  const desktop = {
    kind: 'desktop-release',
    tag: TAG,
    gitSha: SHA,
    platforms: Object.fromEntries(
      ['windows-x64', 'linux-x64', 'macos-x64', 'macos-arm64'].map((p) => [
        p,
        { runtimeValidation: { status: 'passed' } },
      ]),
    ),
  };
  const docker = { kind: 'docker-release', tag: TAG, gitSha: SHA, images: candidate.images };
  const quality = {
    kind: 'release-quality-receipt',
    schemaVersion: 1,
    gitSha: SHA,
    status: 'passed',
    web: 'passed',
    provider: 'passed',
    runId: 9,
    runAttempt: 1,
  };
  const writeEvidence = async (candidateState, releaseState) => {
    await writeFile(path.join(root, 'release-manifest.json'), encode(releaseState));
    await writeFile(path.join(root, 'candidate-set-v1.json'), encode(candidateState));
    await writeFile(path.join(root, 'desktop-release-manifest.json'), encode(desktop));
    await writeFile(path.join(root, 'docker-release-manifest.json'), encode(docker));
    await writeFile(path.join(root, 'release-quality-receipt.json'), encode(quality));
    await writeFile(
      path.join(root, 'github-release.json'),
      encode({
        assets: [{ name: 'desktop-update-feed.tar.gz', digest: digestFor('a'), size: 300 }],
      }),
    );
  };
  const finalize = () =>
    finalizeReleaseChannel({
      manifestPath: path.join(root, 'release-manifest.json'),
      evidenceRoot: root,
      channel: 'nightly',
      runId: '9',
      runAttempt: '1',
      runtimeDigest: digestFor('e'),
    });
  try {
    await writeEvidence(candidate, release());
    const nightly = await finalize();
    assert.equal(nightly.ciRunId, 5);
    assert.equal(typeof nightly.ciRunId, 'number');
    assert.match(await readFile(path.join(root, 'nightly-manifest.json'), 'utf8'), /"ciRunId": 5/u);

    // A digit-string ciRunId is read by validation but must never satisfy the
    // Nightly identity gate: only the numeric producer output may finalize.
    const drifted = { ...candidate, ciRunId: '5' };
    drifted.digest = candidateSetDigest(drifted);
    await writeEvidence(drifted, { ...release(), candidateSet: { digest: drifted.digest } });
    await assert.rejects(finalize, /candidate source mismatch/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release workflows enforce scheduled Nightly, manual Stable, no Main auto-CD, and required native/acceptance gates', async () => {
  const load = async (name) =>
    YAML.parse(
      await readFile(
        new URL('../../../.github/workflows/' + name + '.yml', import.meta.url),
        'utf8',
      ),
    );
  const [n, s, c, p, assets, images] = await Promise.all(
    [
      'nightly-release',
      'release-publish',
      'candidate-publish',
      'deploy-production',
      'release-assets',
      'publish-images',
    ].map(load),
  );
  assert.equal(n.on.schedule[0].cron, '8,38 * * * *');
  assert.equal(n.on.workflow_dispatch.inputs.dry_run.default, true);
  assert.equal(s.on.workflow_dispatch.inputs.nightly_tag.required, true);
  for (const workflow of [s, c, p]) {
    assert.equal(workflow.on.workflow_run, undefined);
    assert.equal(workflow.on.push, undefined);
  }
  assert.ok(s.jobs.finalize.needs.includes('release-quality'));
  assert.ok(s.jobs.finalize.needs.includes('release-assets'));
  assert.ok(s.jobs.finalize.needs.includes('publish-images'));
  assert.match(s.jobs.finalize.if, /release-quality.result == 'success'/u);
  assert.ok(assets.jobs['upload-release-assets'].needs.includes('windows-installed-update-e2e'));
  assert.equal(images.jobs['promote-candidate'].needs.includes('resolve-candidate'), false);
  assert.equal(s.jobs['build-candidate'].with.promote_staging, false);
  assert.equal(c.on.workflow_call.inputs.promote_staging.default, false);
  assert.equal(c.on.workflow_dispatch.inputs.promote_staging.default, false);
  assert.equal(
    assets.jobs['windows-installed-update-e2e'].with.qa_overlay_ref,
    '${{ needs.prepare-release.outputs.release_sha }}',
  );
});

test('published Nightly feed archive replacement blocks Stable promotion', async () => {
  const f = fixture();
  f.metadata.assets.find((asset) => asset.name === 'desktop-update-feed.tar.gz').digest =
    'sha256:' + '0'.repeat(64);
  await assert.rejects(() => verify(f), /update feed changed/u);
});
