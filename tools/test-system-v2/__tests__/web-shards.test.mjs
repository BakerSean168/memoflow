/* eslint-disable @nx/enforce-module-boundaries -- governance test validates the Web-owned manifest */
import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';
import { WEB_SPECIALIZED_SPECS } from '../../../apps/web/web-specialized-specs.mjs';
import { planShards, planWarnings } from '../lib/shard-balance.mjs';
import { parseShardArgument, WEB_SPEC_DURATIONS_PATH } from '../run-web-shard.mjs';
import {
  buildDurationHistory,
  collectTestDurations,
  indexTitles,
} from '../refresh-web-spec-durations.mjs';

import {
  planWebShards,
  selectWebSpecs,
  executedWebSpecs,
  WEB_SHARD_POLICY,
} from '../lib/web-shards.mjs';

const history = JSON.parse(await readFile(WEB_SPEC_DURATIONS_PATH, 'utf8'));

async function specializedShardMatrix() {
  const ci = await readFile('.github/workflows/ci.yml', 'utf8');
  assert.doesNotMatch(ci, /run-ci-tasks.mjs web-specialized/u);
  const nightly = await readFile('.github/workflows/nightly-audit.yml', 'utf8');
  assert.match(nightly, /nx run web:e2e:ai-provider/u);
  const plan = planWebShards({ specs: WEB_SPECIALIZED_SPECS, durations: history.specs });
  return plan.shards.map(({ id }) => parseShardArgument(id));
}

test('the retained specialized planner covers every Nightly Provider spec exactly once', async () => {
  const matrix = await specializedShardMatrix();
  assert.ok(matrix.length > 0);
  assert.ok(matrix.every((entry) => entry.count === matrix.length));
  assert.deepEqual(
    matrix.map((entry) => entry.index),
    matrix.map((_, index) => index + 1),
  );
  const { shards } = planShards({
    specs: WEB_SPECIALIZED_SPECS,
    durations: history.specs,
    shardCount: matrix.length,
  });
  const collected = shards.flatMap((shard) => shard.specs);
  assert.equal(collected.length, new Set(collected).size);
  assert.deepEqual([...collected].sort(), [...WEB_SPECIALIZED_SPECS].sort());
  assert.ok(shards.every((shard) => shard.specs.length > 0));
});

test('shard arguments are validated', () => {
  assert.deepEqual(parseShardArgument('3/4'), { index: 3, count: 4 });
  assert.throws(() => parseShardArgument('5/4'), /Unknown Web specialized shard/u);
  assert.throws(() => parseShardArgument('3'), /<index>\/<count>/u);
});

test('specialized Web specs exist on disk and duration history has no retired specs', async () => {
  for (const spec of WEB_SPECIALIZED_SPECS) {
    await access(`apps/web/e2e/${spec}`);
  }
  assert.equal(history.version, 2);
  assert.ok(Number.isFinite(Date.parse(history.generatedAt)), 'generatedAt is required');
  assert.ok(Number.isFinite(Date.parse(history.observedAt)), 'observedAt is required');
  assert.equal(typeof history.source, 'string');
  const retiredDurationSpecs = Object.keys(history.specs).filter(
    (spec) => !WEB_SPECIALIZED_SPECS.includes(spec),
  );
  assert.deepEqual(retiredDurationSpecs, []);
  for (const entry of Object.values(history.specs)) {
    assert.ok(
      Number.isFinite(Date.parse(entry.observedAt)),
      'each spec needs its observation date',
    );
  }
});

test('timing refresh attributes split-file results to the spec that now owns the title', () => {
  const observedAt = '2026-10-10T00:00:00.000Z';
  const report = {
    stats: { startTime: observedAt },
    suites: [
      {
        file: 'ai/old-monolith.spec.ts',
        suites: [
          {
            specs: [
              {
                title: 'moved journey',
                tests: [
                  {
                    results: [
                      { retry: 0, duration: 40 },
                      { retry: 1, duration: 99 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        file: 'kept.spec.ts',
        specs: [{ title: 'kept', tests: [{ results: [{ retry: 0, duration: 10 }] }] }],
      },
    ],
  };
  const rows = collectTestDurations(report);
  assert.deepEqual(rows, [
    { file: 'ai/old-monolith.spec.ts', title: 'moved journey', durationMs: 40, observedAt },
    { file: 'kept.spec.ts', title: 'kept', durationMs: 10, observedAt },
  ]);
  const owners = indexTitles({ 'ai/new.spec.ts': "test('moved journey', async () => {});" });
  const built = buildDurationHistory({
    runs: [rows, rows.map((row) => ({ ...row, durationMs: row.durationMs * 3 }))],
    specs: ['ai/new.spec.ts', 'kept.spec.ts'],
    titleOwners: owners,
    source: 'test',
    generatedAt: '2026-10-18T00:00:00.000Z',
  });
  assert.deepEqual(built.specs, {
    'ai/new.spec.ts': { durationMs: 80, samples: 2, observedAt },
    'kept.spec.ts': { durationMs: 20, samples: 2, observedAt },
  });
  assert.equal(built.observedAt, observedAt);
});

test('refreshing mixed-age reports preserves the oldest contributing observation', () => {
  const generatedAt = '2026-10-18T00:00:00.000Z';
  const report = (startTime, file) => ({
    stats: { startTime },
    suites: [{ file, specs: [{ title: file, tests: [{ results: [{ duration: 10 }] }] }] }],
  });
  const old = '2026-01-01T00:00:00.000Z';
  const built = buildDurationHistory({
    runs: [
      collectTestDurations(report(old, 'old.spec.ts')),
      collectTestDurations(report(generatedAt, 'fresh.spec.ts')),
    ],
    specs: ['old.spec.ts', 'fresh.spec.ts'],
    titleOwners: new Map(),
    source: 'test',
    generatedAt,
  });
  assert.equal(built.generatedAt, generatedAt);
  assert.equal(built.observedAt, old);
  assert.equal(built.specs['old.spec.ts'].observedAt, old);
  assert.equal(built.specs['fresh.spec.ts'].observedAt, generatedAt);
  assert.match(planWarnings(built, { missing: [] }, Date.parse(generatedAt))[0], /290 days old/u);
});

test('timing reports with missing, invalid or future observation dates are rejected', () => {
  const now = Date.parse('2026-10-18T00:00:00Z');
  for (const startTime of [undefined, '', 'invalid', '2027-01-01T00:00:00Z', 123]) {
    assert.throws(
      () => collectTestDurations({ stats: { startTime }, suites: [] }, now),
      /startTime/u,
    );
  }
});

test('specialized acceptance owns dynamic ports without ordinary Flow startup', async () => {
  const source = await readFile('apps/web/e2e/helpers/run-ai-provider-playwright.ts', 'utf8');
  assert.match(source, /server\.listen\(0, '127\.0\.0\.1'/u);
  const runner = await readFile('tools/test-system-v2/run-web-shard.mjs', 'utf8');
  assert.match(runner, /web:e2e:ai-provider/u);
  assert.doesNotMatch(runner, /E2E_OPENAI_MOCK_PORT/u);
});

test('specialized shard math caps a single acceptance spec at one runner and handles zero', () => {
  const specs = [...WEB_SPECIALIZED_SPECS];
  assert.equal(
    planWebShards({ specs, durations: { [specs[0]]: { durationMs: 900_000 } } }).shardCount,
    1,
  );
  assert.equal(planWebShards({ specs: [] }).shardCount, 0);
  assert.equal(
    planWebShards({ specs, durations: { [specs[0]]: { durationMs: -1 } } }).estimatedTotalMs,
    1,
  );
  assert.throws(
    () => planWebShards({ specs, policy: { ...WEB_SHARD_POLICY, targetPerShardMs: 1 } }),
    /budget/u,
  );
});

test('scope narrowing proves canonical-only edits; unknown/shared/full scope runs all', () => {
  const spec = WEB_SPECIALIZED_SPECS[0];
  assert.deepEqual(selectWebSpecs({ enabled: true, files: [`apps/web/e2e/${spec}`] }), {
    specs: [spec],
    fallback: false,
  });
  for (const files of [undefined, [], ['apps/web/src/App.vue'], ['apps/web/e2e/deleted.spec.ts']]) {
    const selection = selectWebSpecs({ enabled: true, files });
    const plan = planWebShards({ ...selection, durations: history.specs });
    assert.deepEqual(plan.specs, [...WEB_SPECIALIZED_SPECS]);
    assert.ok(plan.shardCount >= 1 && plan.shardCount <= WEB_SHARD_POLICY.defaultShards);
    assert.equal(plan.fallback, true);
  }
  const full = selectWebSpecs({ enabled: true, full: true, files: [] });
  assert.equal(full.fallback, false);
  assert.deepEqual(full.specs, [...WEB_SPECIALIZED_SPECS]);
  assert.deepEqual(selectWebSpecs({ enabled: false }), { specs: [], fallback: false });
});

test('ordinary owners have no Flow/core floor while specialized acceptance and visuals retain their job', () => {
  for (const file of [
    'packages/notification/src/api/index.ts',
    'packages/goal/src/index.ts',
    'packages/app-vue/src/modules/task/view.vue',
    'nx.json',
  ]) {
    const selected = selectWebSpecs({ enabled: true, files: [file] });
    assert.deepEqual(selected.specs, ['ai/provider-onboarding.spec.ts']);
    assert.equal(planWebShards({ ...selected, durations: history.specs }).shardCount, 1);
  }
});

test('execution evidence ignores listed/skipped specs and retains unexpected execution', () => {
  const report = {
    suites: [
      {
        specs: [
          { file: 'selected.spec.ts', tests: [{ results: [{ status: 'passed' }] }] },
          { file: 'skipped.spec.ts', tests: [{ results: [{ status: 'skipped' }] }] },
          { file: 'listed.spec.ts', tests: [] },
          { file: 'unexpected.spec.ts', tests: [{ results: [{ status: 'passed' }] }] },
        ],
      },
    ],
  };
  assert.deepEqual(executedWebSpecs(report), ['selected.spec.ts', 'unexpected.spec.ts']);
  assert.deepEqual(
    executedWebSpecs({
      suites: [
        {
          specs: [
            { file: 'expected-failure.spec.ts', tests: [{ results: [{ status: 'failed' }] }] },
          ],
        },
      ],
    }),
    ['expected-failure.spec.ts'],
  );
});

test('runner consumes exact manifest assignment and captures results before later suites', async () => {
  const { mkdtemp, mkdir, writeFile, chmod, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { buildDeliveryManifest } =
    await import('../../ci-cd-platform/generate-delivery-manifest.mjs');
  const root = await mkdtemp(path.join(tmpdir(), 'web-shard-runner-'));
  const spec = WEB_SPECIALIZED_SPECS[0];
  const manifest = await buildDeliveryManifest({
    event: 'pull_request',
    full: false,
    base: 'base',
    head: 'head',
    files: [`apps/web/e2e/${spec}`],
    scope: {
      version: 1,
      unit: [],
      coverage: [],
      smoke: [],
      integration: [],
      boundary: [],
      perf: [],
      webFlow: true,
    },
  });
  try {
    await mkdir(path.join(root, 'apps/web/test-results'), { recursive: true });
    await mkdir(path.join(root, 'scope'));
    await mkdir(path.join(root, 'tools/test-system-v2'), { recursive: true });
    await writeFile(path.join(root, WEB_SPEC_DURATIONS_PATH), JSON.stringify(history));
    await writeFile(path.join(root, 'scope/delivery-manifest-v1.json'), JSON.stringify(manifest));
    await writeFile(
      path.join(root, 'pnpm'),
      `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync('args.json', JSON.stringify(process.argv.slice(2)));
fs.writeFileSync('apps/web/test-results/provider-results.json', JSON.stringify({suites:[{specs:[{file:${JSON.stringify(spec)},tests:[{results:[{status:'passed'}]}]}]}]}));
`,
    );
    await chmod(path.join(root, 'pnpm'), 0o755);
    const runner = path.resolve('tools/test-system-v2/run-web-shard.mjs');
    const env = {
      ...process.env,
      PATH: `${root}:${process.env.PATH}`,
      GITHUB_RUN_ID: '90210',
      GITHUB_RUN_ATTEMPT: '2',
    };
    execFileSync(process.execPath, [runner, '1/1'], {
      cwd: root,
      env,
      stdio: 'pipe',
      timeout: 30_000,
    });
    assert.deepEqual(JSON.parse(await readFile(path.join(root, 'args.json'), 'utf8')), [
      'exec',
      'nx',
      'run',
      'web:e2e:ai-provider',
      '--output-style=static',
      '--',
      '--config',
      'playwright.config.ts',
      `e2e/${spec}`,
    ]);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(root, 'reports/web-shards/shard-1.json'), 'utf8')),
      {
        id: '1/1',
        commit: manifest.commit,
        runId: '90210',
        runAttempt: 2,
        manifestDigest: manifest.digest,
        exitCode: 0,
        specs: [spec],
      },
    );
    assert.throws(
      () =>
        execFileSync(process.execPath, [runner, '1/4'], {
          cwd: root,
          env,
          stdio: 'pipe',
          timeout: 30_000,
        }),
      /Command failed/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('storybook-only changes select no Web specs (Q4 Component Browser lane owns them)', async () => {
  const { selectWebSpecs } = await import('../lib/web-shards.mjs');
  assert.deepEqual(
    selectWebSpecs({
      enabled: true,
      full: false,
      files: ['packages/goal-ui/src/components/dialogs/GoalDialog.stories.ts'],
    }),
    { specs: [], fallback: false },
  );
  const mixed = selectWebSpecs({
    enabled: true,
    full: false,
    files: [
      'packages/goal-ui/src/components/dialogs/GoalDialog.stories.ts',
      'apps/web/e2e/ai/provider-onboarding.spec.ts',
    ],
  });
  assert.deepEqual(mixed.specs, ['ai/provider-onboarding.spec.ts']);
});

test('unknown-scope fallback retains every spec without reserving four runners for a small suite', () => {
  const durations = Object.fromEntries(
    WEB_SPECIALIZED_SPECS.map((spec) => [spec, { durationMs: 1000 }]),
  );
  const plan = planWebShards({ specs: [WEB_SPECIALIZED_SPECS[0]], fallback: true, durations });
  assert.equal(plan.shardCount, 1);
  assert.deepEqual(
    [...plan.shards.flatMap((shard) => shard.specs)].sort(),
    [...WEB_SPECIALIZED_SPECS].sort(),
  );
});
