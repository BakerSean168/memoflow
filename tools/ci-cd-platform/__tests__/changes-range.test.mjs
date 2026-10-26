import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ensureChangesRange } from '../lib/changes-range.mjs';

const git = (cwd, ...args) =>
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      '-c',
      'core.hooksPath=/dev/null',
      ...args,
    ],
    { cwd, encoding: 'utf8', stdio: 'pipe' },
  ).trim();

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ci-changes-range-'));
  const origin = path.join(root, 'origin');
  git(root, 'init', '--initial-branch=main', origin);
  const commit = async (name) => {
    await writeFile(path.join(origin, name), name);
    git(origin, 'add', '.');
    git(origin, 'commit', '-m', name);
    return git(origin, 'rev-parse', 'HEAD');
  };
  const first = await commit('first');
  const before = await commit('before');
  git(origin, 'checkout', '-b', 'feature');
  await commit('feature-one');
  await commit('feature-two');
  const feature = git(origin, 'rev-parse', 'HEAD');
  git(origin, 'checkout', 'main');
  await commit('main-change');
  git(origin, 'merge', '--no-ff', 'feature', '-m', 'synthetic pull request merge');
  const head = git(origin, 'rev-parse', 'HEAD');
  const checkout = path.join(root, 'checkout');
  git(root, 'clone', '--depth=2', '--branch=main', `file://${origin}`, checkout);
  const run = async (args) => git(checkout, ...args);
  return { root, checkout, first, before, feature, head, run };
}

test('Changes accepts shallow two-parent PR merge without downloading full history', async () => {
  const f = await createFixture();
  try {
    const base = git(f.checkout, 'rev-parse', 'HEAD^1');
    const result = await ensureChangesRange({
      base,
      head: f.head,
      pullRequest: true,
      git: f.run,
    });
    assert.deepEqual(result, { fetched: false, shallowExpanded: false });
    assert.equal(git(f.checkout, 'rev-parse', '--is-shallow-repository'), 'true');
    assert.equal(
      git(f.checkout, 'diff', '--name-only', base, f.head).includes('feature-one'),
      true,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('multi-commit push hydates the exact missing before SHA without fetching all history', async () => {
  const f = await createFixture();
  try {
    assert.throws(() => git(f.checkout, 'cat-file', '-e', `${f.first}^{commit}`));
    const result = await ensureChangesRange({
      base: f.first,
      head: f.head,
      pullRequest: false,
      git: f.run,
    });
    assert.deepEqual(result, { fetched: true, shallowExpanded: false });
    assert.equal(git(f.checkout, 'rev-parse', '--is-shallow-repository'), 'true');
    assert.equal(git(f.checkout, 'cat-file', '-t', f.first), 'commit');
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('PR with missing shallow ancestry hydrates its real common ancestor, not a branch tip', async () => {
  const f = await createFixture();
  try {
    const initial = git(f.checkout, 'rev-parse', '--is-shallow-repository');
    assert.equal(initial, 'true');
    const result = await ensureChangesRange({
      base: f.first,
      head: f.head,
      pullRequest: true,
      git: f.run,
    });
    assert.equal(result.fetched, true);
    assert.equal(git(f.checkout, 'merge-base', f.first, f.head), f.first);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('missing immutable history fails closed when remote is unavailable', async () => {
  const f = await createFixture();
  try {
    git(f.checkout, 'remote', 'set-url', 'origin', path.join(f.root, 'gone'));
    await assert.rejects(
      ensureChangesRange({ base: f.first, head: f.head, pullRequest: true, git: f.run }),
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('invalid or absent event SHA never guesses a mutable branch', async () => {
  const valid = 'a'.repeat(40);
  await assert.rejects(ensureChangesRange({ head: 'main' }), /immutable head/u);
  await assert.rejects(ensureChangesRange({ head: valid, base: 'main' }), /immutable base/u);
  assert.deepEqual(await ensureChangesRange({ head: valid }), {
    fetched: false,
    shallowExpanded: false,
  });
  assert.deepEqual(await ensureChangesRange({ head: valid, base: '0'.repeat(40) }), {
    fetched: false,
    shallowExpanded: false,
  });
});

test('Changes uses a lean install but retains the identical Nx task-level selector and fail-closed receipt gate', async () => {
  const { readFile } = await import('node:fs/promises');
  const YAML = (await import('yaml')).default;
  const workflow = YAML.parse(
    await readFile(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  );
  const action = YAML.parse(
    await readFile(
      new URL('../../../.github/actions/setup-nx-affected-job/action.yml', import.meta.url),
      'utf8',
    ),
  );
  const changes = workflow.jobs['scope-detector'];
  const checkout = changes.steps.find((step) => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with['fetch-depth'], 2);
  const setup = changes.steps.find(
    (step) => step.uses === './.github/actions/setup-nx-affected-job',
  );
  assert.equal(setup.with['changes-only'], 'true');
  assert.equal(setup.with['enable-nx-cache'], 'false');
  assert.equal(setup.with['setup-python'], 'false');
  assert.equal(setup.with['setup-uv'], 'false');
  const scope = changes.steps.find((step) => step.id === 'scope');
  assert.match(scope.run, /prepare-ci-manifest.mjs/u);
  const lite = action.runs.steps.find((step) => step.name === 'Install Nx planner dependencies');
  const ordinary = action.runs.steps.find((step) => step.name === 'Install dependencies');
  assert.match(lite.run, /pnpm install --filter \. --frozen-lockfile --ignore-scripts/u);
  assert.match(lite.if, /changes-only == 'true'/u);
  assert.match(ordinary.if, /changes-only != 'true'/u);
  for (const step of action.runs.steps.filter((item) =>
    /Cache Nx task results|Pin Nx cache directory/u.test(item.name),
  )) {
    assert.match(step.if, /changes-only != 'true'/u);
  }
  assert.match(
    await readFile(new URL('../lib/task-selection.mjs', import.meta.url), 'utf8'),
    /selectAffectedTasks\(/u,
  );
  assert.equal(
    workflow.jobs['ci-check'].steps.some((step) => /ci-check.mjs/u.test(step.run ?? '')),
    true,
  );
});
