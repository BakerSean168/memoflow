'use strict';

const MINIMUM_GAP_MS = 6 * 60 * 60 * 1000;
const SHA_RE = /^[0-9a-f]{40}$/u;
const NIGHTLY_TAG_RE = /^v\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/u;

function assertSha(sha, label) {
  if (typeof sha !== 'string' || !SHA_RE.test(sha)) {
    throw new Error(label + ' must be a full lowercase Git SHA');
  }
  return sha;
}

function resolveNextNightlyVersion(currentVersion) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(currentVersion);
  if (!match) throw new Error('unexpected desktop version: ' + currentVersion);
  return match[1] + '.' + match[2] + '.' + (Number(match[3]) + 1);
}

function makeNightlyTag(currentVersion, now, runNumber) {
  const timestamp = Date.parse(now);
  if (!Number.isFinite(timestamp)) throw new Error('invalid Nightly timestamp');
  if (!Number.isSafeInteger(runNumber) || runNumber < 1) {
    throw new Error('Nightly run number must be positive');
  }
  const date = new Date(timestamp).toISOString().slice(0, 10).replaceAll('-', '');
  return 'v' + resolveNextNightlyVersion(currentVersion) + '-nightly.' + date + '.' + runNumber;
}

function findLatestNightly(releases) {
  if (!Array.isArray(releases)) throw new Error('releases must be an array');
  const nightlies = releases
    .filter(
      (release) =>
        release &&
        release.draft === false &&
        release.prerelease === true &&
        NIGHTLY_TAG_RE.test(release.tag_name ?? ''),
    )
    .map((release) => ({
      tag: release.tag_name,
      publishedAt: release.published_at,
      timestamp: Date.parse(release.published_at),
    }));

  if (nightlies.some((release) => !Number.isFinite(release.timestamp))) {
    throw new Error('published Nightly is missing a valid publication time');
  }
  nightlies.sort((a, b) => b.timestamp - a.timestamp);
  return nightlies[0] ?? null;
}

// Pure decision logic: all external data is validated before selecting a release.
function decideNightly({ now, mainSha, ci, latestNightly, comparison }) {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error('invalid current time');
  assertSha(mainSha, 'main');
  if (
    !ci ||
    ci.head_sha !== mainSha ||
    ci.head_branch !== 'main' ||
    ci.event !== 'push' ||
    ci.status !== 'completed' ||
    ci.conclusion !== 'success' ||
    !Number.isSafeInteger(ci.id) ||
    ci.id < 1 ||
    ci.requiredCheckSucceeded !== true
  ) {
    return { eligible: false, reason: 'main_ci_not_verified' };
  }
  if (!latestNightly) return { eligible: true, reason: 'first_nightly' };
  if (!NIGHTLY_TAG_RE.test(latestNightly.tag ?? '')) {
    throw new Error('latest Nightly tag is invalid');
  }
  assertSha(latestNightly.sha, 'last Nightly');
  const lastPublished = Date.parse(latestNightly.publishedAt);
  if (!Number.isFinite(lastPublished) || lastPublished > nowMs) {
    throw new Error('Nightly publication timestamp invalid or in the future');
  }
  if (latestNightly.sha === mainSha) {
    return { eligible: false, reason: 'already_published_this_sha' };
  }
  if (!comparison || !['ahead', 'behind', 'diverged', 'identical'].includes(comparison.status)) {
    throw new Error('cannot verify Git ancestry of last Nightly');
  }
  if (comparison.status !== 'ahead' || !(comparison.ahead_by > 0)) {
    return { eligible: false, reason: 'nightly_not_ancestor_of_main' };
  }
  if (nowMs - lastPublished < MINIMUM_GAP_MS) {
    return { eligible: false, reason: 'minimum_nightly_gap' };
  }
  return { eligible: true, reason: 'new_verified_main_commits' };
}

function data(response, name) {
  if (!response || typeof response !== 'object' || !('data' in response)) {
    throw new Error(name + ' response is missing data');
  }
  return response.data;
}

function ensureArray(value, name) {
  if (!Array.isArray(value)) throw new Error(name + ' is not an array');
  return value;
}

// GitHub I/O adapter. No package installs, builds, mutable refs, or deployment operations.
async function resolveNightlyEligibility({
  github,
  owner,
  repo,
  now = new Date().toISOString(),
  runNumber,
}) {
  if (!github?.rest || typeof github.paginate !== 'function') {
    throw new Error('GitHub client is required');
  }
  const branch = data(await github.rest.repos.getBranch({ owner, repo, branch: 'main' }), 'main');
  const mainSha = assertSha(branch?.commit?.sha, 'main');
  const runs = ensureArray(
    await github.paginate(github.rest.actions.listWorkflowRuns, {
      owner,
      repo,
      workflow_id: 'ci.yml',
      branch: 'main',
      head_sha: mainSha,
      event: 'push',
      status: 'completed',
      per_page: 100,
    }),
    'CI runs',
  );
  const ciCandidates = runs
    .filter(
      (run) =>
        run.head_sha === mainSha &&
        run.head_branch === 'main' &&
        run.event === 'push' &&
        run.status === 'completed' &&
        run.conclusion === 'success' &&
        Number.isSafeInteger(run.id) &&
        run.id > 0,
    )
    .sort((a, b) => b.id - a.id);

  let verifiedCi = null;
  for (const candidate of ciCandidates) {
    const jobs = ensureArray(
      await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
        owner,
        repo,
        run_id: candidate.id,
        filter: 'latest',
        per_page: 100,
      }),
      'CI jobs',
    );
    const checks = jobs.filter((job) => job.name === 'CI Check');
    if (
      checks.length !== 1 ||
      checks[0].status !== 'completed' ||
      checks[0].conclusion !== 'success'
    ) {
      continue;
    }
    verifiedCi = { ...candidate, requiredCheckSucceeded: true };
    break;
  }
  if (!verifiedCi) {
    return { eligible: false, reason: 'main_ci_not_verified', mainSha, ciRunId: null };
  }

  const releases = ensureArray(
    await github.paginate(github.rest.repos.listReleases, { owner, repo, per_page: 100 }),
    'GitHub Releases',
  );
  const last = findLatestNightly(releases);
  let latestNightly = null;
  let comparison = null;
  if (last) {
    const ref = data(
      await github.rest.git.getRef({ owner, repo, ref: 'tags/' + last.tag }),
      'last Nightly tag',
    );
    let sha = ref?.object?.sha;
    if (ref?.object?.type === 'tag') {
      const annotated = data(await github.rest.git.getTag({ owner, repo, tag_sha: sha }), 'tag');
      sha = annotated?.object?.sha;
    }
    latestNightly = { ...last, sha: assertSha(sha, 'last Nightly') };
    if (sha !== mainSha) {
      comparison = data(
        await github.rest.repos.compareCommits({
          owner,
          repo,
          basehead: last.tag + '...' + mainSha,
        }),
        'Git comparison',
      );
    }
  }
  const decision = decideNightly({ now, mainSha, ci: verifiedCi, latestNightly, comparison });
  if (!decision.eligible) {
    return { ...decision, mainSha, ciRunId: verifiedCi.id, lastNightlyTag: last?.tag ?? null };
  }
  async function readVersionFile(path) {
    const metadata = data(
      await github.rest.repos.getContent({ owner, repo, path, ref: mainSha }),
      path + ' metadata',
    );
    if (metadata?.encoding !== 'base64' || typeof metadata.content !== 'string') {
      throw new Error(path + ' metadata cannot be decoded');
    }
    return JSON.parse(
      Buffer.from(metadata.content.replaceAll('\n', ''), 'base64').toString('utf8'),
    );
  }

  // Release Please maintains these three identities; a Nightly must never
  // become a new version of one package while the others describe older code.
  const [desktop, rootPackage, releaseManifest] = await Promise.all([
    readVersionFile('apps/desktop/package.json'),
    readVersionFile('package.json'),
    readVersionFile('.release-please-manifest.json'),
  ]);
  if (
    typeof desktop.version !== 'string' ||
    desktop.version !== rootPackage?.version ||
    desktop.version !== releaseManifest?.['.']
  ) {
    throw new Error('release version drift between Desktop, root package and Release Please');
  }
  const tag = makeNightlyTag(desktop.version, now, runNumber);
  if (releases.some((release) => release.tag_name === tag)) {
    throw new Error('Nightly release tag already exists: ' + tag);
  }

  // The scheduled event can be delayed. Fail closed if main moves while GitHub
  // API evidence is being collected, before exposing an eligible release SHA.
  const mainAtCommit = data(
    await github.rest.repos.getBranch({ owner, repo, branch: 'main' }),
    'main final',
  );
  if (assertSha(mainAtCommit?.commit?.sha, 'main final') !== mainSha) {
    return {
      eligible: false,
      reason: 'main_advanced_during_check',
      mainSha,
      ciRunId: verifiedCi.id,
    };
  }

  return {
    ...decision,
    mainSha,
    ciRunId: verifiedCi.id,
    lastNightlyTag: last?.tag ?? null,
    nightlyTag: tag,
    stableVersion: resolveNextNightlyVersion(desktop.version),
  };
}

module.exports = {
  MINIMUM_GAP_MS,
  NIGHTLY_TAG_RE,
  decideNightly,
  findLatestNightly,
  makeNightlyTag,
  resolveNextNightlyVersion,
  resolveNightlyEligibility,
};
