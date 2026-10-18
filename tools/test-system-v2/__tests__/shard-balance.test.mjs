import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DURATION_STALE_AFTER_DAYS,
  medianDuration,
  planShards,
  planWarnings,
} from '../lib/shard-balance.mjs';

const durationsOf = (entries) =>
  Object.fromEntries(entries.map(([path, durationMs]) => [path, { durationMs }]));

function randomWorkload(count, seed) {
  let state = seed;
  const next = () => (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  return Array.from({ length: count }, (_, index) => [
    `spec-${String(index).padStart(3, '0')}.spec.ts`,
    Math.round(1_000 + next() * 300_000),
  ]);
}

test('every spec lands in exactly one shard', () => {
  const workload = randomWorkload(120, 7);
  const specs = workload.map(([path]) => path);
  // A third of the specs have no history.
  const durations = durationsOf(workload.filter((_, index) => index % 3 !== 0));
  const { shards } = planShards({ specs, durations, shardCount: 4 });
  const assigned = shards.flatMap((shard) => shard.specs);
  assert.equal(assigned.length, specs.length);
  assert.deepEqual([...assigned].sort(), [...specs].sort());
});

test('the N slowest specs are placed on distinct shards', () => {
  const workload = randomWorkload(40, 11);
  const specs = workload.map(([path]) => path);
  const durations = durationsOf(workload);
  const shardCount = 4;
  const { shards } = planShards({ specs, durations, shardCount });
  const slowest = [...workload].sort((a, b) => b[1] - a[1]).slice(0, shardCount);
  const homes = slowest.map(([path]) => shards.findIndex((shard) => shard.specs.includes(path)));
  assert.equal(new Set(homes).size, shardCount);
});

test('plans are stable regardless of input order', () => {
  const workload = randomWorkload(30, 3);
  const specs = workload.map(([path]) => path);
  const durations = durationsOf(workload);
  const first = planShards({ specs, durations, shardCount: 4 });
  const second = planShards({ specs: [...specs].reverse(), durations, shardCount: 4 });
  assert.deepEqual(second, first);
});

test('specs without history weigh the median of known specs', () => {
  assert.equal(medianDuration([5, 1, 3]), 3);
  assert.equal(medianDuration([4, 1, 3, 2]), 3);
  assert.equal(medianDuration([]), 1);
  const plan = planShards({
    specs: ['a.spec.ts', 'b.spec.ts', 'c.spec.ts', 'new.spec.ts'],
    durations: durationsOf([
      ['a.spec.ts', 10],
      ['b.spec.ts', 30],
      ['c.spec.ts', 20],
    ]),
    shardCount: 2,
  });
  assert.equal(plan.defaultMs, 20);
  assert.deepEqual(plan.missing, ['new.spec.ts']);
  assert.equal(
    plan.shards.reduce((sum, shard) => sum + shard.totalMs, 0),
    10 + 30 + 20 + 20,
  );
});

test('LPT keeps the spread within the largest single spec', () => {
  const workload = randomWorkload(60, 5);
  const { shards } = planShards({
    specs: workload.map(([path]) => path),
    durations: durationsOf(workload),
    shardCount: 4,
  });
  const totals = shards.map((shard) => shard.totalMs);
  const largest = Math.max(...workload.map(([, ms]) => ms));
  assert.ok(Math.max(...totals) - Math.min(...totals) <= largest);
});

test('rejects duplicate specs and invalid shard counts', () => {
  assert.throws(() => planShards({ specs: ['a', 'a'], shardCount: 2 }), /duplicates/u);
  assert.throws(() => planShards({ specs: ['a'], shardCount: 0 }), /positive integer/u);
});

test('warns about stale or incomplete timing history', () => {
  const now = Date.parse('2026-10-18T00:00:00Z');
  const plan = { missing: ['x.spec.ts'], defaultMs: 42 };
  const stale = planWarnings({ generatedAt: '2026-09-01T00:00:00Z' }, plan, now);
  assert.match(stale[0], new RegExp(`> ${DURATION_STALE_AFTER_DAYS}`, 'u'));
  assert.match(stale[1], /x\.spec\.ts/u);
  assert.match(planWarnings({}, { missing: [] }, now)[0], /no generatedAt/u);
  assert.deepEqual(planWarnings({ generatedAt: '2026-10-10T00:00:00Z' }, { missing: [] }, now), []);
});
