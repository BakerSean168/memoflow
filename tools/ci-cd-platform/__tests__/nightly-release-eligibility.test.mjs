import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import nightly from '../lib/nightly-eligibility.cjs';
import {
  createAncestry,
  installCompareRoutes,
  compareUrl,
  httpError,
} from './helpers/octokit-routes.mjs';

const SHA_MAIN = 'a'.repeat(40);
const SHA_PREVIOUS = 'b'.repeat(40);
const SHA_ROOT = 'e'.repeat(40);
const SHA_NEXT = 'c'.repeat(40);
const SHA_SIDE = 'f'.repeat(40);
// main: SHA_ROOT -> SHA_PREVIOUS -> SHA_MAIN -> SHA_NEXT; a sibling branch
// leaves the root at SHA_ROOT so SHA_SIDE diverges from main.
const CHAINS = [
  [SHA_ROOT, SHA_PREVIOUS, SHA_MAIN, SHA_NEXT],
  [SHA_ROOT, SHA_SIDE],
];
const NOW = '2026-10-25T18:00:00.000Z';
const CHECKED_CI = {
  id: 1234,
  head_sha: SHA_MAIN,
  head_branch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  requiredCheckSucceeded: true,
};
const RELEASE = {
  tag: 'v0.22.2-nightly.20261025.1',
  publishedAt: '2026-10-25T10:00:00.000Z',
  sha: SHA_PREVIOUS,
};
const AHEAD = { status: 'ahead', ahead_by: 1 };

function decide(overrides = {}) {
  return nightly.decideNightly({
    now: NOW,
    mainSha: SHA_MAIN,
    ci: CHECKED_CI,
    latestNightly: RELEASE,
    comparison: AHEAD,
    ...overrides,
  });
}
function rawRelease(overrides = {}) {
  return {
    draft: false,
    prerelease: true,
    tag_name: RELEASE.tag,
    published_at: RELEASE.publishedAt,
    ...overrides,
  };
}
function githubFixture(overrides = {}) {
  const values = {
    mainSha: SHA_MAIN,
    ciRuns: [CHECKED_CI],
    jobs: [{ name: 'CI Check', status: 'completed', conclusion: 'success' }],
    releases: [],
    tagSha: SHA_PREVIOUS,
    chains: CHAINS,
    compareErrors: {},
    version: '0.22.1',
    rootVersion: '0.22.1',
    manifestVersion: '0.22.1',
    finalMainSha: SHA_MAIN,
    ...overrides,
  };
  const calls = [];
  const compareCalls = [];
  let branchReads = 0;
  const github = {
    rest: {
      repos: {
        getBranch: async () => ({
          data: { commit: { sha: ++branchReads === 1 ? values.mainSha : values.finalMainSha } },
        }),
        listReleases: () => {},
        getContent: async ({ path }) => {
          const contents = {
            'apps/desktop/package.json': { version: values.version },
            'package.json': { version: values.rootVersion },
            '.release-please-manifest.json': { '.': values.manifestVersion },
          };
          if (!Object.hasOwn(contents, path)) throw new Error('unexpected version metadata path');
          return {
            data: {
              encoding: 'base64',
              content: Buffer.from(JSON.stringify(contents[path])).toString('base64'),
            },
          };
        },
      },
      actions: { listWorkflowRuns: () => {}, listJobsForWorkflowRun: () => {} },
      git: {
        getRef: async () => {
          if (!values.tagSha) throw httpError(404, 'Not Found');
          return { data: { object: { type: 'commit', sha: values.tagSha } } };
        },
        getTag: async () => {
          throw new Error('unexpected annotated tag resolution');
        },
      },
    },
    paginate: async (method, args) => {
      calls.push(args);
      if (method === github.rest.actions.listWorkflowRuns) return values.ciRuns;
      if (method === github.rest.actions.listJobsForWorkflowRun) return values.jobs;
      if (method === github.rest.repos.listReleases) return values.releases;
      throw new Error('unexpected pagination');
    },
  };
  // Every published Nightly tag resolves to the same source commit; drafts are
  // not tags yet and are excluded, matching the real repository state.
  const refs = { [RELEASE.tag]: values.tagSha };
  for (const release of values.releases) {
    if (release?.tag_name && release.draft !== true) refs[release.tag_name] = values.tagSha;
  }
  const ancestry = createAncestry({ chains: values.chains, refs });
  installCompareRoutes(github.rest.repos, {
    ancestry,
    errors: values.compareErrors,
    calls: compareCalls,
  });
  return { github, calls, compareCalls };
}
async function resolve(overrides = {}) {
  const fixture = githubFixture(overrides);
  return nightly.resolveNightlyEligibility({
    github: fixture.github,
    owner: 'BakerSean168',
    repo: 'memoflow',
    now: NOW,
    runNumber: 198,
  });
}
async function resolveWith(overrides = {}) {
  const fixture = githubFixture(overrides);
  const outcome = await nightly.resolveNightlyEligibility({
    github: fixture.github,
    owner: 'BakerSean168',
    repo: 'memoflow',
    now: NOW,
    runNumber: 198,
  });
  return { outcome, fixture };
}

test('Nightly requires successful exact SHA main push CI and the CI Check gate', () => {
  for (const key of [
    'head_sha',
    'head_branch',
    'event',
    'status',
    'conclusion',
    'requiredCheckSucceeded',
  ]) {
    const ci = { ...CHECKED_CI };
    ci[key] = {
      head_sha: SHA_PREVIOUS,
      head_branch: 'feature/test',
      event: 'pull_request',
      status: 'queued',
      conclusion: 'failure',
      requiredCheckSucceeded: false,
    }[key];
    assert.deepEqual(decide({ ci }), { eligible: false, reason: 'main_ci_not_verified' }, key);
  }
  assert.deepEqual(decide({ ci: null }), { eligible: false, reason: 'main_ci_not_verified' });
});

test('first nightly may be released after main CI; no old tag is not a blockage', () => {
  assert.deepEqual(decide({ latestNightly: null, comparison: null }), {
    eligible: true,
    reason: 'first_nightly',
  });
});

test('existing SHA is never rebuilt and cannot reset the clock', () => {
  assert.deepEqual(decide({ latestNightly: { ...RELEASE, sha: SHA_MAIN }, comparison: null }), {
    eligible: false,
    reason: 'already_published_this_sha',
  });
});

test('minimum interval is exactly six hours; shorter is skipped', () => {
  assert.deepEqual(
    decide({ latestNightly: { ...RELEASE, publishedAt: '2026-10-25T12:00:01.000Z' } }),
    { eligible: false, reason: 'minimum_nightly_gap' },
  );
  assert.deepEqual(
    decide({ latestNightly: { ...RELEASE, publishedAt: '2026-10-25T12:00:00.000Z' } }),
    { eligible: true, reason: 'new_verified_main_commits' },
  );
});

test('non-descendant, divergence or missing ancestry cannot authorize release', () => {
  for (const status of ['behind', 'diverged', 'identical']) {
    assert.deepEqual(decide({ comparison: { status, ahead_by: 0 } }), {
      eligible: false,
      reason: 'nightly_not_ancestor_of_main',
    });
  }
  assert.throws(() => decide({ comparison: null }), /cannot verify Git ancestry/u);
  assert.deepEqual(decide({ comparison: { status: 'ahead' } }), {
    eligible: false,
    reason: 'nightly_not_ancestor_of_main',
  });
});

test('bad SHA and publication timestamps are not treated as no release', () => {
  assert.throws(() => decide({ mainSha: 'deadbeef' }), /full lowercase Git SHA/u);
  assert.throws(
    () => decide({ latestNightly: { ...RELEASE, sha: 'oops' } }),
    /full lowercase Git SHA/u,
  );
  assert.throws(
    () => decide({ latestNightly: { ...RELEASE, publishedAt: 'unknown' } }),
    /invalid/u,
  );
  assert.throws(
    () => decide({ latestNightly: { ...RELEASE, publishedAt: '2026-11-25T10:00:00Z' } }),
    /future/u,
  );
});

test('only published prereleases matching the Nightly scheme participate', () => {
  assert.equal(nightly.findLatestNightly([]), null);
  assert.deepEqual(
    nightly.findLatestNightly([
      rawRelease({ tag_name: 'v0.22.2' }),
      rawRelease({ draft: true, published_at: '2026-11-25T10:00:00Z' }),
      rawRelease({ prerelease: false }),
      rawRelease({ tag_name: 'v0.22.2-preview.20261025.2' }),
      rawRelease({ published_at: '2026-10-24T10:00:00Z' }),
      rawRelease(),
    ]),
    {
      tag: RELEASE.tag,
      publishedAt: RELEASE.publishedAt,
      timestamp: Date.parse(RELEASE.publishedAt),
    },
  );
  assert.throws(() => nightly.findLatestNightly([rawRelease({ published_at: null })]), /missing/u);
});

test('nightly version preserves Release Please source and is deterministic for time and run', () => {
  assert.equal(nightly.makeNightlyTag('0.22.1', NOW, 198), 'v0.22.1-nightly.20261025.198');
  assert.throws(
    () => nightly.makeNightlyTag('0.22.1-nightly.1', NOW, 198),
    /unexpected desktop version/u,
  );
  assert.throws(() => nightly.makeNightlyTag('0.22.1', 'bad time', 198), /timestamp/u);
  assert.throws(() => nightly.makeNightlyTag('0.22.1', NOW, 0), /run number/u);
});

test('GitHub adapter binds main SHA, completed CI and its exact successful CI Check', async () => {
  const fixture = githubFixture();
  const output = await nightly.resolveNightlyEligibility({
    github: fixture.github,
    owner: 'BakerSean168',
    repo: 'memoflow',
    now: NOW,
    runNumber: 198,
  });
  assert.equal(output.eligible, true);
  assert.equal(output.reason, 'first_nightly');
  assert.equal(output.nightlyTag, 'v0.22.1-nightly.20261025.198');
  assert.equal(output.mainSha, SHA_MAIN);
  assert.equal(output.ciRunId, 1234);
  assert.equal(fixture.calls[0].head_sha, SHA_MAIN);
  assert.equal(fixture.calls[0].event, 'push');
  assert.equal(fixture.calls[1].run_id, 1234);
});

test('HTTP adapter skips missing CI, altered identity and no CI Check', async () => {
  assert.deepEqual(await resolve({ ciRuns: [] }), {
    eligible: false,
    reason: 'main_ci_not_verified',
    mainSha: SHA_MAIN,
    ciRunId: null,
  });
  for (const ciRuns of [
    [{ ...CHECKED_CI, event: 'pull_request' }],
    [{ ...CHECKED_CI, head_sha: SHA_PREVIOUS }],
  ]) {
    assert.equal((await resolve({ ciRuns })).reason, 'main_ci_not_verified');
  }
  for (const jobs of [[], [{ name: 'CI Check', status: 'completed', conclusion: 'failure' }]]) {
    assert.equal((await resolve({ jobs })).reason, 'main_ci_not_verified');
  }
});

test('HTTP adapter does not authorize old SHA, identical SHA, no minimum interval or broken ancestry', async () => {
  assert.equal(
    (await resolve({ releases: [rawRelease()], tagSha: SHA_MAIN })).reason,
    'already_published_this_sha',
  );
  assert.equal(
    (await resolve({ releases: [rawRelease({ published_at: '2026-10-25T16:00:00Z' })] })).reason,
    'minimum_nightly_gap',
  );
  assert.equal(
    (await resolve({ releases: [rawRelease()], tagSha: SHA_SIDE })).reason,
    'nightly_not_ancestor_of_main',
  );
});

test('ancestry request uses GET /repos/{owner}/{repo}/compare/{base}...{head} with the tag as base', async () => {
  const { outcome, fixture } = await resolveWith({ releases: [rawRelease()] });
  assert.equal(outcome.eligible, true);
  assert.equal(outcome.reason, 'new_verified_main_commits');
  assert.equal(fixture.compareCalls.length, 1);
  const [call] = fixture.compareCalls;
  assert.equal(call.adapter, 'compareCommitsWithBasehead');
  assert.equal(call.method, 'GET');
  assert.deepEqual(call.missing, []);
  assert.equal(call.url, compareUrl('BakerSean168', 'memoflow', RELEASE.tag, SHA_MAIN));
  assert.equal(call.params.basehead, RELEASE.tag + '...' + SHA_MAIN);
});

test('ancestry matrix: identical, ahead, behind and diverged keep the ancestry gate intact', async () => {
  // Identical cannot reach the endpoint: the same-SHA short circuit fires first
  // and must not issue a comparison at all.
  const same = await resolveWith({ releases: [rawRelease()], tagSha: SHA_MAIN });
  assert.equal(same.outcome.reason, 'already_published_this_sha');
  assert.equal(same.fixture.compareCalls.length, 0);

  const ahead = await resolveWith({ releases: [rawRelease()] });
  assert.equal(ahead.outcome.eligible, true);

  for (const [name, tagSha] of [
    ['behind', SHA_NEXT],
    ['diverged', SHA_SIDE],
  ]) {
    const { outcome, fixture } = await resolveWith({ releases: [rawRelease()], tagSha });
    assert.equal(outcome.reason, 'nightly_not_ancestor_of_main', name);
    assert.equal(
      fixture.compareCalls[0].url,
      compareUrl('BakerSean168', 'memoflow', RELEASE.tag, SHA_MAIN),
      name,
    );
  }
});

test('ancestry transport failures (404, 403, 429) and missing tags abort instead of authorizing', async () => {
  await assert.rejects(() => resolve({ releases: [rawRelease()], tagSha: '9'.repeat(40) }), {
    status: 404,
  });
  for (const status of [403, 429]) {
    await assert.rejects(
      () =>
        resolve({
          releases: [rawRelease()],
          compareErrors: { compareCommitsWithBasehead: httpError(status) },
        }),
      { status },
    );
  }
  await assert.rejects(() => resolve({ releases: [rawRelease()], tagSha: null }), { status: 404 });
  await assert.rejects(() => resolve({ releases: [rawRelease()], tagSha: 'oops' }), /Git SHA/u);
});

test('ancestry is computed against the main SHA observed before the comparison', async () => {
  const { fixture } = await resolveWith({ releases: [rawRelease()], finalMainSha: SHA_NEXT });
  assert.equal(
    fixture.compareCalls[0].url,
    compareUrl('BakerSean168', 'memoflow', RELEASE.tag, SHA_MAIN),
  );
});

test('API failures and tag collisions abort rather than declaring eligibility', async () => {
  await assert.rejects(() => resolve({ mainSha: 'broken' }), /full lowercase Git SHA/u);
  await assert.rejects(
    () => resolve({ releases: [rawRelease({ published_at: 'not a date' })] }),
    /publication time/u,
  );
  await assert.rejects(
    () =>
      resolve({
        version: '0.22.1-nightly.2',
        rootVersion: '0.22.1-nightly.2',
        manifestVersion: '0.22.1-nightly.2',
      }),
    /unexpected desktop version/u,
  );
  await assert.rejects(
    () => resolve({ releases: [rawRelease({ tag_name: 'v0.22.1-nightly.20261025.198' })] }),
    /tag already exists/u,
  );
});

test('Nightly release refuses version drift across Desktop, root and Release Please', async () => {
  for (const mismatch of [{ rootVersion: '0.22.3' }, { manifestVersion: '0.22.0' }]) {
    await assert.rejects(() => resolve(mismatch), /release version drift/u);
  }
});

test('Nightly release checks main again and rejects a mid-flight HEAD advance', async () => {
  const outcome = await resolve({ finalMainSha: SHA_PREVIOUS });
  assert.deepEqual(outcome, {
    eligible: false,
    reason: 'main_advanced_during_check',
    mainSha: SHA_MAIN,
    ciRunId: 1234,
  });
});

test('workflow checks eligibility without installing repository dependencies or performing mutation', async () => {
  const workflow = await readFile(
    new URL('../../../.github/workflows/nightly-release.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /cron:\s*['"]8,38 \* \* \* \*['"]/u);
  assert.match(workflow, /nightly-release/u);
  assert.match(workflow, /cancel-in-progress:\s*false/u);
  assert.match(workflow, /resolveNightlyEligibility/u);
  assert.doesNotMatch(
    workflow,
    /pnpm install|npm install|nx build|gh release create|docker build|docker push/u,
  );
});

test('same-source failed Nightly resumes one existing draft rather than producing duplicate tags', async () => {
  const draft = rawRelease({
    tag_name: 'v0.22.1-nightly.20261024.177',
    draft: true,
    target_commitish: SHA_MAIN,
  });
  const outcome = await resolve({ releases: [draft] });
  assert.equal(outcome.eligible, true);
  assert.equal(outcome.nightlyTag, draft.tag_name);
  assert.equal(outcome.stableVersion, '0.22.1');
  await assert.rejects(
    () => resolve({ releases: [draft, { ...draft, tag_name: 'v0.22.1-nightly.20261024.178' }] }),
    /ambiguous Nightly drafts/u,
  );
});
