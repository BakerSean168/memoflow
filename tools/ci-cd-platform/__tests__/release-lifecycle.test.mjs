import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import lifecycle from '../lib/release-lifecycle.cjs';
import { prepareReleaseSource } from '../release-tools/prepare-release-source.mjs';
import { finalizeReleaseChannel } from '../release-tools/finalize-release-channel.mjs';

const SHA = 'a'.repeat(40),
  OTHER = 'b'.repeat(40),
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
    tag: TAG,
    version: '1.4.2',
    ci: structuredClone(ci),
    run: structuredClone(run),
    comparison: 'ahead',
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
        getBranch: async () => ({ data: { commit: { sha: SHA } } }),
        compareCommits: async () => ({ data: { status: state.comparison } }),
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
  return { state, github, metadata, data };
}
const verify = (f) =>
  lifecycle.verifyPublishedNightly({ github: f.github, ...coordinates, tag: TAG });

test('published Nightly verifies source, native platforms, OCI parity, API hashes and successful run', async () => {
  const f = fixture();
  const result = await verify(f);
  assert.equal(result.sha, SHA);
  assert.equal(result.version, '1.4.2');
  assert.match(result.manifestDigest, /^sha256:/u);
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
      s.comparison = 'diverged';
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
