'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const SHA = /^[a-f0-9]{40}$/u;
const STABLE = /^v(\d+\.\d+\.\d+)$/u;
const NIGHTLY = /^v(\d+\.\d+\.\d+)-nightly\.\d{8}\.\d+$/u;
const PLATFORMS = ['windows-x64', 'linux-x64', 'macos-x64', 'macos-arm64'];
const hash = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const output = (core, plan) => {
  for (const [name, value] of Object.entries(plan)) core.setOutput(name, String(value ?? ''));
  return plan;
};
function requireSha(sha) {
  assert(typeof sha === 'string' && SHA.test(sha), 'full immutable source SHA required');
  return sha;
}
function releaseVersion(tag, channel) {
  assert(['stable', 'nightly'].includes(channel), 'unknown release channel');
  const match = (channel === 'nightly' ? NIGHTLY : STABLE).exec(tag ?? '');
  assert(match, 'release tag does not match channel');
  return { sourceVersion: match[1], packageVersion: tag.slice(1) };
}
async function resolveTag(github, coordinates, tag) {
  const ref = (await github.rest.git.getRef({ ...coordinates, ref: 'tags/' + tag })).data;
  let object = ref.object;
  for (let n = 0; object.type === 'tag' && n < 5; n += 1) {
    object = (await github.rest.git.getTag({ ...coordinates, tag_sha: object.sha })).data.object;
  }
  assert(object.type === 'commit', 'release tag must resolve to a commit');
  return requireSha(object.sha);
}
async function findRelease(github, coordinates, tag) {
  const releases = await github.paginate(github.rest.repos.listReleases, {
    ...coordinates,
    per_page: 100,
  });
  const found = releases.filter((r) => r.tag_name === tag);
  assert(found.length <= 1, 'ambiguous release records');
  return found[0] ?? null;
}
async function sourceVersion(github, coordinates, sha) {
  const files = await Promise.all(
    ['package.json', 'apps/desktop/package.json', '.release-please-manifest.json'].map(
      async (path) => {
        const response = (await github.rest.repos.getContent({ ...coordinates, path, ref: sha }))
          .data;
        assert(
          response.encoding === 'base64' && typeof response.content === 'string',
          'invalid source version metadata',
        );
        return JSON.parse(Buffer.from(response.content, 'base64').toString('utf8'));
      },
    ),
  );
  const version = files[0].version;
  assert(
    /^\d+\.\d+\.\d+$/u.test(version) && files[1].version === version && files[2]['.'] === version,
    'Release Please/source version drift',
  );
  return version;
}
async function verifyMainCi(github, coordinates, sha, suppliedRunId) {
  requireSha(sha);
  let run;
  if (suppliedRunId) {
    assert(/^\d+$/u.test(String(suppliedRunId)), 'invalid main CI run id');
    run = (
      await github.rest.actions.getWorkflowRun({ ...coordinates, run_id: Number(suppliedRunId) })
    ).data;
  } else {
    const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
      ...coordinates,
      workflow_id: 'ci.yml',
      event: 'push',
      head_sha: sha,
      status: 'success',
      per_page: 100,
    });
    run = runs
      .filter((r) => r.head_sha === sha && r.event === 'push' && r.head_branch === 'main')
      .sort((a, b) => b.id - a.id)[0];
  }
  assert(
    run &&
      run.head_sha === sha &&
      run.head_branch === 'main' &&
      run.event === 'push' &&
      run.path === '.github/workflows/ci.yml' &&
      run.status === 'completed' &&
      run.conclusion === 'success',
    'no successful exact-SHA main CI',
  );
  assert(Number.isSafeInteger(run.id) && run.id > 0, 'invalid main CI identity');
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
    ...coordinates,
    run_id: run.id,
    filter: 'latest',
    per_page: 100,
  });
  const gate = jobs.filter((j) => j.name === 'CI Check');
  assert(
    gate.length === 1 && gate[0].status === 'completed' && gate[0].conclusion === 'success',
    'main CI required Check did not pass',
  );
  const main = (await github.rest.repos.getBranch({ ...coordinates, branch: 'main' })).data.commit
    .sha;
  const comparison = (
    await github.rest.repos.compareCommitsWithBasehead({
      ...coordinates,
      basehead: sha + '...' + requireSha(main),
    })
  ).data;
  assert(['ahead', 'identical'].includes(comparison.status), 'source is not an ancestor of main');
  return run;
}
async function readAsset(github, coordinates, release, name) {
  const matches = (release.assets ?? []).filter((a) => a.name === name);
  assert(matches.length === 1, 'missing or ambiguous release asset: ' + name);
  const asset = matches[0];
  assert(
    /^sha256:[a-f0-9]{64}$/u.test(asset.digest ?? ''),
    'GitHub asset digest required: ' + name,
  );
  assert(asset.size > 0 && asset.size <= 10 * 1024 * 1024, 'invalid evidence asset size: ' + name);
  const result = await github.rest.repos.getReleaseAsset({
    ...coordinates,
    asset_id: asset.id,
    headers: { accept: 'application/octet-stream' },
  });
  const bytes = Buffer.isBuffer(result.data)
    ? result.data
    : typeof result.data === 'string'
      ? Buffer.from(result.data)
      : Buffer.from(result.data);
  assert(
    bytes.length === asset.size && hash(bytes) === asset.digest,
    'release asset digest mismatch: ' + name,
  );
  return { json: JSON.parse(bytes.toString('utf8')), digest: asset.digest };
}
function validateNightlyEvidence({ nightly, release, candidate, desktop, docker, sha, tag }) {
  assert(
    nightly?.schemaVersion === 1 && nightly.kind === 'memoflow-nightly',
    'invalid Nightly manifest',
  );
  assert(
    nightly.tag === tag && nightly.gitSha === sha && nightly.channel === 'nightly',
    'Nightly source identity mismatch',
  );
  assert(
    nightly.quality?.status === 'passed' &&
      nightly.quality.desktop === 'passed' &&
      nightly.quality.images === 'passed' &&
      nightly.quality.acceptance === 'passed',
    'Nightly quality did not pass',
  );
  assert(
    /^sha256:[a-f0-9]{64}$/u.test(nightly.runtimeArtifact?.digest ?? ''),
    'missing immutable Nightly runtime artifact',
  );
  const version = releaseVersion(tag, 'nightly');
  assert(nightly.sourceVersion === version.sourceVersion, 'Nightly version mismatch');
  assert(
    Number.isSafeInteger(nightly.runId) &&
      nightly.runId > 0 &&
      Number.isSafeInteger(nightly.ciRunId) &&
      nightly.ciRunId > 0,
    'missing Nightly run identity',
  );
  assert(
    release.kind === 'memoflow-release' &&
      release.channel === 'nightly' &&
      release.gitSha === sha &&
      release.tag === tag &&
      release.ciRunId === nightly.ciRunId &&
      release.postflight?.status === 'passed',
    'invalid Nightly release postflight',
  );
  const acceptance = release.qualityReceipt;
  // Same provenance rule as finalization: the receipt must come from this exact
  // publication run and source, but an earlier attempt of that run is the normal
  // outcome of recovering a failed lane with "rerun failed jobs".
  assert(
    acceptance?.kind === 'release-quality-receipt' &&
      acceptance.schemaVersion === 1 &&
      acceptance.gitSha === sha &&
      acceptance.runId === nightly.runId &&
      Number.isSafeInteger(acceptance.runAttempt) &&
      acceptance.runAttempt > 0 &&
      acceptance.runAttempt <= nightly.runAttempt &&
      acceptance.status === 'passed' &&
      acceptance.web === 'passed' &&
      acceptance.provider === 'passed',
    'published Nightly acceptance receipt mismatch',
  );
  assert(
    candidate.gitSha === sha &&
      candidate.ciRunId === nightly.ciRunId &&
      candidate.digest === release.candidateSet?.digest,
    'Nightly candidate source mismatch',
  );
  assert(
    desktop.gitSha === sha && desktop.tag === tag && docker.gitSha === sha && docker.tag === tag,
    'Nightly lane identity mismatch',
  );
  for (const platform of PLATFORMS) {
    assert(
      desktop.platforms?.[platform]?.runtimeValidation?.status === 'passed',
      'missing native runtime proof: ' + platform,
    );
  }
  for (const component of ['api', 'web', 'migrator']) {
    const original = candidate.images?.[component];
    const image = docker.images?.[component];
    assert(
      /^sha256:[a-f0-9]{64}$/u.test(original?.digest ?? '') && image?.digest === original.digest,
      'Nightly image identity mismatch: ' + component,
    );
    for (const distribution of ['china', 'global']) {
      assert(
        image.distributions?.[distribution]?.digest === original.digest &&
          image.distributions[distribution].repository ===
            original.distributions?.[distribution]?.repository,
        'Nightly registry parity mismatch',
      );
    }
  }
  return nightly;
}
async function verifyPublishedNightly({ github, owner, repo, tag }) {
  releaseVersion(tag, 'nightly');
  const coordinates = { owner, repo };
  const metadata = await findRelease(github, coordinates, tag);
  assert(
    metadata && metadata.draft === false && metadata.prerelease === true,
    'selected Nightly must be published and prerelease',
  );
  const sha = await resolveTag(github, coordinates, tag);
  const names = [
    'nightly-manifest.json',
    'release-manifest.json',
    'candidate-set-v1.json',
    'desktop-release-manifest.json',
    'docker-release-manifest.json',
  ];
  const assets = await Promise.all(
    names.map((name) => readAsset(github, coordinates, metadata, name)),
  );
  const [nightly, release, candidate, desktop, docker] = assets.map((a) => a.json);
  validateNightlyEvidence({ nightly, release, candidate, desktop, docker, sha, tag });
  for (let n = 1; n < names.length; n += 1) {
    assert(
      nightly.evidence?.[names[n]] === assets[n].digest,
      'Nightly evidence binding mismatch: ' + names[n],
    );
  }
  for (const asset of desktop.assets ?? []) {
    const remote = (metadata.assets ?? []).filter((a) => a.name === asset.name);
    assert(
      remote.length === 1 &&
        remote[0].size === asset.size &&
        remote[0].digest === 'sha256:' + asset.sha256,
      'published native asset changed: ' + asset.name,
    );
  }
  assert((desktop.assets ?? []).length > 0, 'Nightly has no native artifacts');
  const feed = release.updateFeedArchive;
  const remoteFeed = (metadata.assets ?? []).filter(
    (asset) => asset.name === 'desktop-update-feed.tar.gz',
  );
  assert(
    feed?.name === 'desktop-update-feed.tar.gz' &&
      feed.channel === 'nightly' &&
      /^sha256:[a-f0-9]{64}$/u.test(feed.digest ?? '') &&
      remoteFeed.length === 1 &&
      remoteFeed[0].digest === feed.digest &&
      remoteFeed[0].size === feed.size,
    'published Nightly update feed changed',
  );

  const run = (await github.rest.actions.getWorkflowRun({ ...coordinates, run_id: nightly.runId }))
    .data;
  assert(
    run.id === nightly.runId &&
      run.path === '.github/workflows/nightly-release.yml' &&
      run.head_branch === 'main' &&
      ['schedule', 'workflow_dispatch'].includes(run.event) &&
      run.status === 'completed' &&
      run.conclusion === 'success',
    'untrusted or failed Nightly publication run',
  );
  assert(
    run.repository?.full_name === owner + '/' + repo &&
      run.repository.fork === false &&
      run.head_repository?.full_name === owner + '/' + repo &&
      run.head_repository.fork === false,
    'Nightly must come from the canonical repository',
  );
  const version = await sourceVersion(github, coordinates, sha);
  assert(
    version === nightly.sourceVersion,
    'Nightly no longer matches immutable Release Please source',
  );
  await verifyMainCi(github, coordinates, sha, nightly.ciRunId);
  return { sha, version, nightly, metadata, candidate, manifestDigest: assets[0].digest };
}
async function resolveReleasePlan({
  github,
  owner,
  repo,
  channel = 'stable',
  tag,
  sha,
  ciRunId,
  nightlyTag,
}) {
  const coordinates = { owner, repo };
  let sourceNightly = null;
  if (channel === 'stable') {
    sourceNightly = await verifyPublishedNightly({ github, owner, repo, tag: nightlyTag });
    sha = sourceNightly.sha;
    tag = 'v' + sourceNightly.version;
    ciRunId = sourceNightly.nightly.ciRunId;
  }
  requireSha(sha);
  const version = await sourceVersion(github, coordinates, sha);
  assert(
    releaseVersion(tag, channel).sourceVersion === version,
    'release version must follow selected source, not a new commit',
  );
  const ci = await verifyMainCi(github, coordinates, sha, ciRunId);
  if (channel === 'stable') {
    const releases = await github.paginate(github.rest.repos.listReleases, {
      ...coordinates,
      per_page: 100,
    });
    const tuple = (value) => value.replace(/^v/u, '').split('.').map(Number);
    const compare = (a, b) => {
      const x = tuple(a),
        y = tuple(b);
      for (let n = 0; n < 3; n += 1) if (x[n] !== y[n]) return x[n] - y[n];
      return 0;
    };
    assert(
      !releases.some(
        (r) => !r.draft && !r.prerelease && STABLE.test(r.tag_name) && compare(r.tag_name, tag) > 0,
      ),
      'Stable promotion cannot downgrade the published channel',
    );
  }
  const existing = await findRelease(github, coordinates, tag);
  if (existing) {
    assert(
      (await resolveTag(github, coordinates, tag)) === sha,
      'release tag collision: refusing to replace another SHA',
    );
    assert(existing.prerelease === (channel === 'nightly'), 'existing release channel mismatch');
  }
  return {
    eligible: !existing || existing.draft,
    already_published: Boolean(existing && !existing.draft),
    tag,
    sha,
    version,
    channel,
    ci_run_id: ci.id,
    source_nightly: sourceNightly ? nightlyTag : '',
    source_nightly_digest: sourceNightly?.manifestDigest ?? '',
    runtime_digest: sourceNightly?.nightly.runtimeArtifact.digest ?? '',
  };
}
async function ensureDraft({ github, owner, repo, tag, sha, channel }) {
  releaseVersion(tag, channel);
  requireSha(sha);
  const coordinates = { owner, repo };
  let tagSha;
  try {
    tagSha = await resolveTag(github, coordinates, tag);
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  assert(!tagSha || tagSha === sha, 'immutable release tag collision');
  if (!tagSha) await github.rest.git.createRef({ ...coordinates, ref: 'refs/tags/' + tag, sha });
  let release = await findRelease(github, coordinates, tag);
  if (release) {
    assert(release.prerelease === (channel === 'nightly'), 'release channel collision');
    assert(release.draft, 'published releases are immutable; no asset overwrite allowed');
  } else {
    release = (
      await github.rest.repos.createRelease({
        ...coordinates,
        tag_name: tag,
        target_commitish: sha,
        name: tag,
        draft: true,
        generate_release_notes: true,
        prerelease: channel === 'nightly',
        body: `Source: ${sha}\nChannel: ${channel}\nPublication requires verified native, image and release-quality evidence.`,
      })
    ).data;
  }
  return release;
}
module.exports = {
  hash,
  output,
  releaseVersion,
  sourceVersion,
  resolveTag,
  findRelease,
  verifyMainCi,
  readAsset,
  validateNightlyEvidence,
  verifyPublishedNightly,
  resolveReleasePlan,
  ensureDraft,
};
