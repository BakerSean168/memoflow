import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  COMPARE_ROUTES,
  compareUrl,
  createAncestry,
  installCompareRoutes,
  parseComparePath,
  resolveCompareRoute,
} from './helpers/octokit-routes.mjs';

const readRepoFile = (path) => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

const OWNER = 'owner';
const REPO = 'repo';
const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const ROOT = 'e'.repeat(40);

test('the two compare adapters expand different route templates', () => {
  assert.equal(COMPARE_ROUTES.compareCommits.path, '/repos/{owner}/{repo}/compare/{base}...{head}');
  assert.equal(
    COMPARE_ROUTES.compareCommitsWithBasehead.path,
    '/repos/{owner}/{repo}/compare/{basehead}',
  );

  const withBasehead = resolveCompareRoute('compareCommitsWithBasehead', {
    owner: OWNER,
    repo: REPO,
    basehead: `${BASE}...${HEAD}`,
  });
  assert.equal(withBasehead.url, compareUrl(OWNER, REPO, BASE, HEAD));
  assert.deepEqual(withBasehead.missing, []);
  assert.deepEqual(parseComparePath(withBasehead.url), {
    owner: OWNER,
    repo: REPO,
    base: BASE,
    head: HEAD,
  });

  // The historical defect: `basehead` handed to `compareCommits` leaves {base}
  // and {head} empty, so the request path is not a compare route at all.
  const misplaced = resolveCompareRoute('compareCommits', {
    owner: OWNER,
    repo: REPO,
    basehead: `${BASE}...${HEAD}`,
  });
  assert.equal(misplaced.url, '/repos/owner/repo/compare/...');
  assert.deepEqual(misplaced.missing, ['base', 'head']);
  assert.equal(parseComparePath(misplaced.url), null);
});

test('no call site passes basehead to the base/head adapter', async () => {
  for (const file of [
    'tools/ci-cd-platform/lib/release-lifecycle.cjs',
    'tools/ci-cd-platform/lib/nightly-eligibility.cjs',
    '.github/workflows/release-publish.yml',
    '.github/workflows/nightly-audit.yml',
  ]) {
    const source = await readRepoFile(file);
    assert.doesNotMatch(source, /compareCommits\s*\(\s*\{[^}]*\bbasehead\b/su, file);
  }
});

test('the three fixed call sites keep their basehead expression verbatim', async () => {
  const lifecycle = await readRepoFile('tools/ci-cd-platform/lib/release-lifecycle.cjs');
  assert.match(
    lifecycle,
    /compareCommitsWithBasehead\(\{\s*\.\.\.coordinates,\s*basehead: sha \+ '\.\.\.' \+ requireSha\(main\),\s*\}\)/u,
  );
  const eligibility = await readRepoFile('tools/ci-cd-platform/lib/nightly-eligibility.cjs');
  assert.match(
    eligibility,
    /compareCommitsWithBasehead\(\{\s*owner,\s*repo,\s*basehead: last\.tag \+ '\.\.\.' \+ mainSha,\s*\}\)/u,
  );
  const publish = await readRepoFile('.github/workflows/release-publish.yml');
  assert.match(
    publish,
    /compareCommitsWithBasehead\(\{ \.\.\.context\.repo, basehead: `\$\{releasePr\.merge_commit_sha\}\.\.\.\$\{process\.env\.RELEASE_SHA\}` \}\)/u,
  );
});

test('nightly-audit keeps the basehead adapter that matches its range syntax', async () => {
  const workflow = await readRepoFile('.github/workflows/nightly-audit.yml');
  assert.match(workflow, /compareCommitsWithBasehead\(\{/u);
  assert.match(workflow, /basehead: `\$\{latest\.tag_name\}\.\.\.main`/u);
  assert.doesNotMatch(workflow, /compareCommits\(\{/u);
  const resolved = resolveCompareRoute('compareCommitsWithBasehead', {
    owner: OWNER,
    repo: REPO,
    basehead: 'v1.4.2...main',
  });
  assert.equal(resolved.url, '/repos/owner/repo/compare/v1.4.2...main');
  assert.deepEqual(parseComparePath(resolved.url), {
    owner: OWNER,
    repo: REPO,
    base: 'v1.4.2',
    head: 'main',
  });
});

function githubScriptBlock(workflow, stepName) {
  const marker = `- name: ${stepName}`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, 'workflow step not found: ' + stepName);
  const next = workflow.indexOf('\n      - name:', start + marker.length);
  const step = workflow.slice(start, next < 0 ? workflow.length : next);
  const lines = step.split('\n');
  const at = lines.findIndex((line) => /^\s+script:\s*\|$/u.test(line));
  assert.notEqual(at, -1, 'github-script block not found in ' + stepName);
  const indent = lines[at].match(/^\s*/u)[0].length + 2;
  const body = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    if (line.match(/^\s*/u)[0].length < indent) break;
    body.push(line.slice(indent));
  }
  return body.join('\n').trimEnd();
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function runReconcileStep({ chains, merge, releaseSha, pulls }) {
  const workflow = await readRepoFile('.github/workflows/release-publish.yml');
  const script = githubScriptBlock(workflow, 'Reconcile release-please labels');
  const compareCalls = [];
  const added = [];
  const removed = [];
  const repos = {};
  installCompareRoutes(repos, { ancestry: createAncestry({ chains }), calls: compareCalls });
  const pullsList = () => {};
  const github = {
    paginate: async (method) => (method === pullsList ? pulls : []),
    rest: {
      pulls: { list: pullsList },
      repos,
      issues: {
        addLabels: async (args) => {
          added.push(args);
        },
        removeLabel: async (args) => {
          removed.push(args);
        },
      },
    },
  };
  const context = { repo: { owner: OWNER, repo: REPO } };
  const core = { notice: () => {} };
  const previous = { version: process.env.RELEASE_VERSION, sha: process.env.RELEASE_SHA };
  process.env.RELEASE_VERSION = '1.4.2';
  process.env.RELEASE_SHA = releaseSha;
  try {
    await new AsyncFunction('github', 'context', 'core', script)(github, context, core);
  } finally {
    for (const [key, value] of [
      ['RELEASE_VERSION', previous.version],
      ['RELEASE_SHA', previous.sha],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  return { compareCalls, added, removed };
}

const releasePr = (merge) => ({
  number: 77,
  merged_at: '2026-10-26T00:00:00Z',
  title: 'chore(main): release 1.4.2',
  merge_commit_sha: merge,
  labels: [{ name: 'autorelease: pending' }],
});

test('release-publish reconcile step requests the compare route with basehead', async () => {
  const merge = 'c'.repeat(40);
  const releaseSha = 'd'.repeat(40);
  const { compareCalls, added, removed } = await runReconcileStep({
    chains: [[ROOT, merge, releaseSha]],
    merge,
    releaseSha,
    pulls: [releasePr(merge)],
  });
  assert.equal(compareCalls.length, 1);
  const [call] = compareCalls;
  assert.equal(call.adapter, 'compareCommitsWithBasehead');
  assert.equal(call.method, 'GET');
  assert.deepEqual(call.missing, []);
  assert.equal(call.url, compareUrl(OWNER, REPO, merge, releaseSha));
  assert.deepEqual(added[0].labels, ['autorelease: tagged']);
  assert.equal(removed[0].name, 'autorelease: pending');
});

test('release-publish reconcile step accepts an identical milestone and rejects behind or diverged', async () => {
  const merge = 'c'.repeat(40);
  const identical = await runReconcileStep({
    chains: [[ROOT, merge]],
    merge,
    releaseSha: merge,
    pulls: [releasePr(merge)],
  });
  assert.equal(identical.compareCalls[0].url, compareUrl(OWNER, REPO, merge, merge));
  assert.deepEqual(identical.added[0].labels, ['autorelease: tagged']);

  const releaseSha = 'd'.repeat(40);
  const side = 'f'.repeat(40);
  for (const [name, chains] of [
    ['behind', [[ROOT, releaseSha, merge]]],
    [
      'diverged',
      [
        [ROOT, releaseSha],
        [ROOT, merge],
      ],
    ],
  ]) {
    await assert.rejects(
      () => runReconcileStep({ chains, merge, releaseSha, pulls: [releasePr(merge)] }),
      /not in selected Nightly source/u,
      name,
    );
  }
});
