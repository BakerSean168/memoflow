import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareQualityShadow } from '../compare-quality-shadow.mjs';
import { compareTimingSamples } from '../compare-timings.mjs';
import { digest } from '../lib/contracts.mjs';
import {
  buildQualityShadowSample,
  QUALITY_CHILDREN,
  QUALITY_CHILD_NAMES,
} from '../quality-shadow.mjs';

const workload = {
  name: 'desktop-pr286',
  base: 'ee8472486377c30ecced3ef1ec07012fd8a06f24',
  head: 'ca3970a4c536addfc48409db1c22ebb4e0ce9ae6',
};
const controlPlaneSha = 'a'.repeat(40);

function childReceipt({
  runId = '1',
  profile,
  child,
  index,
  failed = false,
  command = QUALITY_CHILDREN[child],
}) {
  const setupStart = 1_000 + (profile === 'split' ? index * 100 : 0);
  const setupEnd = setupStart + (profile === 'split' ? 100 : 120);
  const started = 2_000 + index * 100;
  const duration = 200 + index * 10;
  const jobKey = profile === 'split' ? `split-${child}` : 'consolidated';
  const receipt = {
    kind: 'quality-shadow-child-v1',
    version: 1,
    profile,
    child,
    command,
    workload,
    controlPlaneSha,
    runId,
    runAttempt: '1',
    jobKey,
    jobStartedAtMs: profile === 'split' ? 900 + index * 100 : 900,
    setupStartedAtMs: setupStart,
    setupEndedAtMs: setupEnd,
    startedAtMs: started,
    endedAtMs: started + duration,
    executionMs: duration,
    status: failed ? 'failure' : 'success',
    exitCode: failed ? 1 : 0,
    provenance: { generator: 'test' },
  };
  receipt.digest = digest(receipt);
  return receipt;
}

function pairedReceipts(runId = '1', options = {}) {
  return ['split', 'consolidated'].flatMap((profile) =>
    QUALITY_CHILD_NAMES.map((child, index) =>
      childReceipt({
        runId,
        profile,
        child,
        index,
        failed: options.failedProfile === profile && options.failedChild === child,
      }),
    ),
  );
}

function sample(
  runId,
  { splitWall = 1000, consolidatedWall = 700, splitRunner = 4, consolidatedRunner = 2 } = {},
) {
  const value = buildQualityShadowSample(pairedReceipts(String(runId)));
  value.split.wallClockMs = splitWall + runId;
  value.split.runnerMinutes = splitRunner + runId / 100;
  value.consolidated.wallClockMs = consolidatedWall + runId;
  value.consolidated.runnerMinutes = consolidatedRunner + runId / 100;
  delete value.digest;
  value.digest = digest(value);
  return value;
}

test('quality shadow child commands remain byte-for-byte aligned with required CI commands', () => {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  );
  for (const [child, command] of Object.entries(QUALITY_CHILDREN)) {
    assert.ok(workflow.includes(command), `${child} shadow command drifted from required CI`);
  }
});

test('paired sample preserves six logical children and distinguishes 6 split jobs from 1 consolidated job', () => {
  const result = buildQualityShadowSample(pairedReceipts('42'));
  assert.equal(result.status, 'success');
  assert.deepEqual(Object.keys(result.children).sort(), [...QUALITY_CHILD_NAMES].sort());
  assert.equal(result.split.setupMs, 600);
  assert.equal(result.consolidated.setupMs, 120);
  assert.ok(result.split.runnerMinutes > result.consolidated.runnerMinutes);
});

test('paired sample records child failure instead of hiding it behind the consolidated boolean', () => {
  const result = buildQualityShadowSample(
    pairedReceipts('42', { failedProfile: 'consolidated', failedChild: 'unit-1' }),
  );
  assert.equal(result.status, 'failure');
  assert.equal(result.children['unit-1'].split, 'success');
  assert.equal(result.children['unit-1'].consolidated, 'failure');
});

test('paired sample fails closed on command drift and incomplete topology', () => {
  const drifted = pairedReceipts('42');
  drifted[0] = childReceipt({
    runId: '42',
    profile: 'split',
    child: drifted[0].child,
    index: 0,
    command: 'echo drift',
  });
  assert.throws(() => buildQualityShadowSample(drifted), /child command drift/);
  assert.throws(() => buildQualityShadowSample(pairedReceipts('42').slice(1)), /exactly twelve/);
});

test('timing sample comparator reuses the standard P50/P95 timing contract', () => {
  const report = compareTimingSamples({
    samples: [1, 2, 3, 4, 5].map((index) => sample(index).split),
    profile: 'quality-split',
  });
  assert.equal(report.kind, 'timing-report-v1');
  assert.equal(report.sampleCount, 5);
  assert.equal(report.metrics.runnerMinutes.samples, 5);
});

test('five successful paired samples promote only when wall time does not regress and runner minutes improve', () => {
  const report = compareQualityShadow({ samples: [1, 2, 3, 4, 5].map((index) => sample(index)) });
  assert.equal(report.decision, 'promote-consolidated');
  assert.equal(report.criteria.wallNonRegressing, true);
  assert.equal(report.criteria.runnerImproves, true);
  assert.ok(report.delta.runnerMinutes.p50 < 0);
});

test('P95 wall regression retains split topology', () => {
  const samples = [1, 2, 3, 4].map((index) => sample(index));
  samples.push(sample(5, { consolidatedWall: 5000 }));
  const report = compareQualityShadow({ samples });
  assert.equal(report.decision, 'retain-split');
  assert.equal(report.criteria.wallNonRegressing, false);
});

test('artifact sample validation rejects forged child status even with a recomputed digest', () => {
  const forged = buildQualityShadowSample(pairedReceipts('42'));
  forged.children['unit-1'].consolidated = 'failure';
  delete forged.digest;
  forged.digest = digest(forged);
  assert.throws(
    () =>
      compareQualityShadow({ samples: [1, 2, 3, 4].map((index) => sample(index)).concat(forged) }),
    /sample status must equal child parity status/,
  );
});

test('shadow workflow is manual-only and preserves 6 split jobs plus one consolidated job', () => {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/quality-runner-shadow.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request):/mu);
  assert.match(workflow, /child: \[static, unit-1, unit-2, unit-3, typecheck, build\]/u);
  assert.match(workflow, /name: Shadow Consolidated Quality/u);
  assert.match(workflow, /name: Quality Shadow Paired Sample/u);
  assert.match(workflow, /default: ee8472486377c30ecced3ef1ec07012fd8a06f24/u);
  assert.match(workflow, /default: ca3970a4c536addfc48409db1c22ebb4e0ce9ae6/u);
  assert.match(workflow, /pattern: quality-shadow-\*-\$\{\{ github\.run_id \}\}/u);
});

test('comparison rejects failed or duplicate paired samples', () => {
  const failed = buildQualityShadowSample(
    pairedReceipts('5', { failedProfile: 'split', failedChild: 'build' }),
  );
  assert.throws(
    () =>
      compareQualityShadow({ samples: [1, 2, 3, 4].map((index) => sample(index)).concat(failed) }),
    /every paired sample must succeed/,
  );
  assert.throws(
    () => compareQualityShadow({ samples: [1, 2, 3, 4, 4].map((index) => sample(index)) }),
    /run ids must be unique/,
  );
});
