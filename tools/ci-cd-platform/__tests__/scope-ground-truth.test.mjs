import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifyRisk, selectLanes, webFlowCandidateFiles } from '../lib/risk.mjs';

const fixture = JSON.parse(
  await readFile(new URL('./fixtures/scope-ground-truth.json', import.meta.url), 'utf8'),
);
const byId = new Map(fixture.cases.map((entry) => [entry.id, entry]));
const LANES = [
  'governance',
  'validate',
  'boundary',
  'integration',
  'web',
  'coverage',
  'performance',
];

test('ground truth covers at least 20 real merged PR diffs and every required scenario', () => {
  const real = fixture.cases.filter((entry) => entry.source.startsWith('https://github.com/'));
  assert.ok(real.length >= 20, `expected >= 20 real PR cases, got ${real.length}`);
  for (const id of [
    'mixed-desktop-app-vue',
    'pr-478',
    'pr-499',
    'pr-497',
    'harness-inventory-only',
    'unknown-path',
    'prisma-schema',
    'pr-472',
  ]) {
    assert.ok(byId.has(id), `missing ground-truth case ${id}`);
  }
  for (const entry of fixture.cases) {
    assert.equal(typeof entry.rationale, 'string', `${entry.id} needs a reviewed rationale`);
    assert.deepEqual(Object.keys(entry.expected.lanes).sort(), [...LANES].sort(), entry.id);
  }
});

for (const entry of fixture.cases) {
  test(`scope ground truth: ${entry.id}`, () => {
    const risk = classifyRisk(entry.files);
    assert.equal(risk.level, entry.expected.risk);
    assert.deepEqual(risk.matchedLevels, entry.expected.matchedLevels);
    assert.deepEqual(selectLanes({ risk, scope: entry.scope }), entry.expected.lanes);
  });
}

test('mixed Desktop + shared Vue change keeps Desktop boundary and Web Flow', () => {
  const entry = byId.get('mixed-desktop-app-vue');
  assert.equal(entry.expected.lanes.web, true);
  assert.equal(entry.expected.lanes.boundary, true);
  assert.deepEqual(webFlowCandidateFiles(entry.files), [
    'packages/task-ui/src/views/TaskManagementView.vue',
  ]);
});

test('negative cases: Desktop-only e2e scripts, docs and harness metadata never select Web Flow', () => {
  for (const id of ['pr-478', 'pr-499', 'pr-497', 'pr-452', 'pr-404', 'harness-inventory-only']) {
    assert.equal(byId.get(id).expected.lanes.web, false, id);
  }
  for (const id of ['pr-499', 'pr-497', 'pr-452', 'pr-404']) {
    const { lanes } = byId.get(id).expected;
    assert.deepEqual(
      Object.entries(lanes)
        .filter(([, enabled]) => enabled)
        .map(([lane]) => lane),
      ['governance'],
      id,
    );
  }
});

test('unknown paths retain every correctness lane; measurements use the audit backstop', () => {
  for (const id of ['unknown-path', 'pr-413', 'pr-401', 'pr-453']) {
    const entry = byId.get(id);
    assert.equal(entry.expected.risk, 'root', id);
    const { coverage, performance, ...correctness } = entry.expected.lanes;
    assert.ok(Object.values(correctness).every(Boolean), id);
    assert.equal(coverage, false, id);
    assert.equal(performance, false, id);
  }
});
