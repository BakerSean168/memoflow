import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildErrorReport,
  buildShadowReport,
  diffSelection,
  legacyReachForProject,
  renderShadowMarkdown,
  summarizeCases,
} from '../lib/affected-shadow.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const cli = path.join(repoRoot, 'tools/ci-cd-platform/shadow-affected.mjs');
const targets = ['build', 'lint', 'test'];

test('identical selections report no differences', () => {
  assert.deepEqual(diffSelection(['a:build', 'b:test'], ['b:test', 'a:build']), {
    identical: true,
    underSelection: [],
    overSelection: [],
  });
});

test('a task legacy runs but task-based drops is an under-selection', () => {
  assert.deepEqual(diffSelection(['a:build', 'b:test'], ['a:build']), {
    identical: false,
    underSelection: ['b:test'],
    overSelection: [],
  });
});

test('a task only task-based runs is an over-selection', () => {
  assert.deepEqual(diffSelection(['a:build'], ['a:build', 'c:lint']), {
    identical: false,
    underSelection: [],
    overSelection: ['c:lint'],
  });
});

test('both directions are reported together', () => {
  assert.deepEqual(diffSelection(['a:build', 'b:test'], ['a:build', 'c:lint']), {
    identical: false,
    underSelection: ['b:test'],
    overSelection: ['c:lint'],
  });
});

test('case summary keeps comparison errors separate from no-diff cases', () => {
  const summary = summarizeCases([
    {
      status: 'ok',
      diff: { underSelection: [], overSelection: [] },
      laneImpact: { droppedLanes: [], gainedLanes: [], legacyLaneDrift: [] },
    },
    {
      status: 'ok',
      diff: { underSelection: ['b:test'], overSelection: ['c:lint'] },
      laneImpact: {
        droppedLanes: ['web'],
        gainedLanes: [],
        legacyLaneDrift: ['unit'],
      },
    },
    { status: 'error', error: { message: 'comparison crashed' } },
  ]);

  assert.deepEqual(summary, {
    cases: 3,
    errors: 1,
    identical: 1,
    withDiffs: 1,
    underSelections: 1,
    overSelections: 1,
    laneCheckedCases: 2,
    droppedLanes: 1,
    droppedLaneCases: 1,
    legacyLaneDrift: 1,
  });
});

test('a tool failure renders as an error, never as an empty comparison', () => {
  const report = buildErrorReport(
    { mode: 'live', targets, source: { base: 'base', head: 'head' } },
    new Error('project graph unavailable'),
  );
  const markdown = renderShadowMarkdown(report);

  assert.equal(report.status, 'error');
  assert.equal(report.summary, undefined);
  assert.match(markdown, /Shadow comparison tool error/u);
  assert.match(markdown, /project graph unavailable/u);
  assert.doesNotMatch(markdown, /Selectors agree/u);
  assert.doesNotMatch(markdown, /identical/u);
});

test('report rendering names under- and over-selected tasks with their evidence', () => {
  const report = buildShadowReport({
    mode: 'replay',
    targets,
    source: { fixture: 'fixture.json' },
    status: 'ok',
    summary: summarizeCases([
      {
        status: 'ok',
        diff: { underSelection: ['b:test'], overSelection: ['c:lint'] },
        laneImpact: { droppedLanes: [], gainedLanes: [], legacyLaneDrift: [] },
      },
    ]),
    cases: [
      {
        id: 'case-1',
        status: 'ok',
        changedFiles: ['packages/lib/src/index.ts'],
        legacy: { tasks: ['a:build', 'b:test'], byTarget: { build: 1, lint: 0, test: 1 } },
        taskBased: { tasks: ['a:build', 'c:lint'], byTarget: { build: 1, lint: 1, test: 0 } },
        diff: { underSelection: ['b:test'], overSelection: ['c:lint'] },
        underDetails: [
          {
            task: 'b:test',
            legacyReach: {
              kind: 'dependency',
              ownFiles: [],
              via: [
                {
                  project: 'lib',
                  path: ['b', 'lib'],
                  changedFiles: ['packages/lib/src/index.ts'],
                  metadataTouched: false,
                },
              ],
            },
          },
        ],
        overDetails: [
          {
            task: 'c:lint',
            reasons: [{ kind: 'input-file', file: 'packages/lib/src/index.ts', pattern: 'default' }],
          },
        ],
        laneImpact: { droppedLanes: [], gainedLanes: [], legacyLaneDrift: [] },
      },
    ],
  });
  const markdown = renderShadowMarkdown(report);

  assert.match(markdown, /task-based under-selection \(1\)/u);
  assert.match(markdown, /`b:test`/u);
  assert.match(markdown, /legacy reach: via b -> lib/u);
  assert.match(markdown, /task-based over-selection \(1\)/u);
  assert.match(markdown, /`c:lint` — input packages\/lib\/src\/index\.ts/u);
});

test('legacy reach explains own files, dependency chains, and metadata-only touches', () => {
  const projectDependencies = { app: ['lib'], lib: [] };
  const projectRoots = { app: 'apps/app', lib: 'packages/lib' };

  assert.deepEqual(
    legacyReachForProject('app', {
      projectDependencies,
      touchedProjects: ['app'],
      changedFiles: ['apps/app/src/main.ts'],
      projectRoots,
    }),
    {
      project: 'app',
      kind: 'own-file',
      ownFiles: ['apps/app/src/main.ts'],
      via: [],
    },
  );

  assert.deepEqual(
    legacyReachForProject('app', {
      projectDependencies,
      touchedProjects: ['lib'],
      changedFiles: ['packages/lib/src/index.ts'],
      projectRoots,
    }),
    {
      project: 'app',
      kind: 'dependency',
      ownFiles: [],
      via: [
        {
          project: 'lib',
          path: ['app', 'lib'],
          changedFiles: ['packages/lib/src/index.ts'],
          metadataTouched: false,
        },
      ],
    },
  );

  assert.deepEqual(
    legacyReachForProject('app', {
      projectDependencies,
      touchedProjects: ['lib'],
      changedFiles: [],
      projectRoots,
    }).via,
    [{ project: 'lib', path: ['app', 'lib'], changedFiles: [], metadataTouched: true }],
  );
});

test('the root project only owns files no other project claims', () => {
  const projectDependencies = { root: [], lib: [] };
  const projectRoots = { root: '.', lib: 'packages/lib' };

  assert.equal(
    legacyReachForProject('root', {
      projectDependencies,
      touchedProjects: ['root'],
      changedFiles: ['README.md'],
      projectRoots,
    }).kind,
    'own-file',
  );
  assert.equal(
    legacyReachForProject('root', {
      projectDependencies,
      touchedProjects: ['lib'],
      changedFiles: ['packages/lib/src/index.ts'],
      projectRoots,
    }).kind,
    'dependency',
  );
});

test('the CLI writes an error artifact and exits non-zero when the comparison crashes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'affected-shadow-error-'));
  const jsonOut = path.join(root, 'report.json');
  const markdownOut = path.join(root, 'report.md');
  try {
    const result = spawnSync(
      process.execPath,
      [
        cli,
        '--fixture',
        path.join(root, 'missing-fixture.json'),
        '--json-out',
        jsonOut,
        '--markdown-out',
        markdownOut,
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );

    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(await readFile(jsonOut, 'utf8'));
    assert.equal(report.status, 'error');
    assert.match(report.error.message, /missing-fixture\.json/u);
    assert.equal(report.provenance.generator, 'ci-cd-platform-v3/shadow-affected@1');
    assert.ok(report.digest);
    assert.match(await readFile(markdownOut, 'utf8'), /Shadow comparison tool error/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the CLI records a skipped run instead of inventing a comparison basis', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'affected-shadow-skip-'));
  const jsonOut = path.join(root, 'report.json');
  const markdownOut = path.join(root, 'report.md');
  try {
    const result = spawnSync(
      process.execPath,
      [cli, '--json-out', jsonOut, '--markdown-out', markdownOut],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, NX_BASE: '', NX_HEAD: '' },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(jsonOut, 'utf8'));
    assert.equal(report.status, 'skipped');
    assert.match(report.skipReason, /no --base\/--head/u);
    assert.match(await readFile(markdownOut, 'utf8'), /Skipped:/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('live mode compares the files changed between --base and --head', async () => {
  // e2513366ef2 introduced this tool; its own diff is a fixed, non-empty range.
  const head = 'e2513366ef2';
  const expected = spawnSync(
    'git',
    ['diff', '--name-only', '--no-renames', '--relative', `${head}^`, head],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.equal(expected.status, 0, expected.stderr);
  const expectedFiles = expected.stdout.split('\n').filter(Boolean).sort();
  assert.ok(expectedFiles.includes('tools/ci-cd-platform/shadow-affected.mjs'));

  const root = await mkdtemp(path.join(tmpdir(), 'affected-shadow-live-'));
  const jsonOut = path.join(root, 'report.json');
  const markdownOut = path.join(root, 'report.md');
  try {
    const result = spawnSync(
      process.execPath,
      [cli, '--base', `${head}^`, '--head', head, '--json-out', jsonOut, '--markdown-out', markdownOut],
      { cwd: repoRoot, encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(jsonOut, 'utf8'));
    assert.equal(report.mode, 'live');
    assert.equal(report.status, 'ok');
    // Same input `nx affected` uses: the git diff minus Nx-ignored paths.
    const changedFiles = report.cases[0].changedFiles;
    assert.ok(changedFiles.includes('tools/ci-cd-platform/shadow-affected.mjs'));
    assert.ok(changedFiles.includes('.github/workflows/ci.yml'));
    assert.deepEqual(changedFiles.filter((file) => !expectedFiles.includes(file)), []);
    assert.ok(report.cases[0].legacy.projects.includes('ci-cd-platform'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
