/* eslint-disable @nx/enforce-module-boundaries -- governance test validates the Web-owned manifest */
import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';
import { WEB_FLOW_SPECS } from '../../../apps/web/web-flow-specs.mjs';
import { planShards, planWarnings } from '../lib/shard-balance.mjs';
import { parseShardArgument, WEB_SPEC_DURATIONS_PATH } from '../run-web-shard.mjs';
import {
  buildDurationHistory,
  collectTestDurations,
  indexTitles,
} from '../refresh-web-spec-durations.mjs';

const history = JSON.parse(await readFile(WEB_SPEC_DURATIONS_PATH, 'utf8'));

async function ciShardMatrix() {
  const ci = await readFile('.github/workflows/ci.yml', 'utf8');
  const matrix = /shard: \[([^\]]+)\]/u.exec(ci)?.[1] ?? '';
  return matrix.split(',').map((entry) => parseShardArgument(entry.trim().replace(/'/gu, '')));
}

test('the CI shard plan covers every canonical Web Flow spec exactly once', async () => {
  const matrix = await ciShardMatrix();
  assert.ok(matrix.length > 0);
  assert.ok(matrix.every((entry) => entry.count === matrix.length));
  assert.deepEqual(
    matrix.map((entry) => entry.index),
    matrix.map((_, index) => index + 1),
  );
  const { shards } = planShards({
    specs: WEB_FLOW_SPECS,
    durations: history.specs,
    shardCount: matrix.length,
  });
  const collected = shards.flatMap((shard) => shard.specs);
  assert.equal(collected.length, new Set(collected).size);
  assert.deepEqual([...collected].sort(), [...WEB_FLOW_SPECS].sort());
  assert.ok(shards.every((shard) => shard.specs.length > 0));
});

test('shard arguments are validated', () => {
  assert.deepEqual(parseShardArgument('3/4'), { index: 3, count: 4 });
  assert.throws(() => parseShardArgument('5/4'), /Unknown Web Flow shard/u);
  assert.throws(() => parseShardArgument('3'), /<index>\/<count>/u);
});

test('canonical Web Flow specs exist on disk and duration history has no retired specs', async () => {
  for (const spec of WEB_FLOW_SPECS) {
    await access(`apps/web/e2e/${spec}`);
  }
  assert.equal(history.version, 2);
  assert.ok(Number.isFinite(Date.parse(history.generatedAt)), 'generatedAt is required');
  assert.ok(Number.isFinite(Date.parse(history.observedAt)), 'observedAt is required');
  assert.equal(typeof history.source, 'string');
  const retiredDurationSpecs = Object.keys(history.specs).filter(
    (spec) => !WEB_FLOW_SPECS.includes(spec),
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

test('Web Flow shard runner allocates a dynamic provider-mock port', async () => {
  const source = await readFile('tools/test-system-v2/run-web-shard.mjs', 'utf8');
  assert.match(source, /server\.listen\(0, '127\.0\.0\.1'/);
  assert.match(source, /E2E_OPENAI_MOCK_PORT: mockPort/);
  assert.match(source, /'--config',\s*'playwright\.config\.ts'/u);
});
