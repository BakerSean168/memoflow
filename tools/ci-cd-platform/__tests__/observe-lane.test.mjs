import { planUnitShards } from '../lib/unit-shards.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLaneInput } from '../create-lane-input.mjs';
import { observeLane } from '../observe-lane.mjs';
import { digest } from '../lib/contracts.mjs';

test('observation aggregates command evidence without changing lane semantics', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memoflow-observe-'));
  const reports = path.join(root, 'reports');
  await mkdir(reports, { recursive: true });
  const manifest = {
    kind: 'delivery-manifest-v1',
    version: 1,
    commit: 'head',
    base: 'base',
    head: 'head',
    event: 'pull_request',
    full: false,
    changedFiles: [],
    risk: { level: 'docs', reasons: ['docs'], matchedLevels: ['docs'] },
    scope: {
      version: 1,
      projects: [],
      unit: [],
      coverage: [],
      smoke: [],
      integration: [],
      boundary: [],
      perf: [],
      webFlow: false,
    },
    lanes: {
      governance: true,
      validate: true,
      boundary: false,
      integration: false,
      web: false,
      coverage: false,
      performance: false,
    },
    provenance: { generator: 'test', inputDigest: 'a'.repeat(64) },
  };
  manifest.webShards = {
    specs: [],
    shards: [],
    shardCount: 0,
    fallback: false,
    estimatedTotalMs: 0,
  };
  if (manifest.lanes.web)
    manifest.webShards = {
      specs: ['test.spec.ts'],
      shards: [{ id: '1/1', specs: ['test.spec.ts'], estimatedMs: 1 }],
      shardCount: 1,
      fallback: false,
      estimatedTotalMs: 1,
    };
  manifest.unitShards = planUnitShards(manifest.scope.unit);
  manifest.digest = digest(manifest);
  const input = await createLaneInput({
    lane: 'governance',
    manifest,
    output: path.join(root, 'input.json'),
  });
  await writeFile(
    path.join(reports, 'governance.json'),
    JSON.stringify({
      version: 1,
      name: 'governance',
      lane: 'governance',
      result: 'success',
      attempts: [{ attempt: 1, durationMs: 12, classification: 'success' }],
      testSummary: {
        reportCount: 1,
        files: { total: 2, passed: 2, failed: 0, skipped: 0 },
        tests: { total: 5, passed: 5, failed: 0, skipped: 0, retries: 0 },
        slowestSpecs: [{ name: 'governance.test.mjs', durationMs: 8 }],
        slowestTests: [{ name: 'checks policy', durationMs: 6 }],
      },
    }),
  );
  const output = path.join(root, 'summary.json');
  const summary = await observeLane({ lane: 'governance', input, reportsDir: reports, output });
  assert.equal(summary.status, 'success');
  assert.equal(summary.timing.executionMs, 12);
  assert.equal(summary.tests.tests.total, 5);
  assert.equal(JSON.parse(await readFile(output, 'utf8')).lane, 'governance');
});

test('observation fails closed when no command report belongs to the lane', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memoflow-observe-lane-'));
  const reports = path.join(root, 'reports');
  await mkdir(reports, { recursive: true });
  await writeFile(
    path.join(reports, 'other.json'),
    JSON.stringify({
      version: 1,
      name: 'other',
      lane: 'integration',
      result: 'failure',
      attempts: [{ attempt: 1, durationMs: 999, classification: 'assertion' }],
    }),
  );
  const manifest = {
    kind: 'delivery-manifest-v1',
    version: 1,
    commit: 'head',
    base: 'base',
    head: 'head',
    event: 'pull_request',
    full: false,
    changedFiles: [],
    risk: { level: 'docs', reasons: ['docs'], matchedLevels: ['docs'] },
    scope: {
      version: 1,
      projects: [],
      unit: [],
      coverage: [],
      smoke: [],
      integration: [],
      boundary: [],
      perf: [],
      webFlow: false,
    },
    lanes: {
      governance: true,
      validate: false,
      boundary: false,
      integration: false,
      web: false,
      coverage: false,
      performance: false,
    },
    provenance: { generator: 'test', inputDigest: 'b'.repeat(64) },
  };
  manifest.webShards = {
    specs: [],
    shards: [],
    shardCount: 0,
    fallback: false,
    estimatedTotalMs: 0,
  };
  if (manifest.lanes.web)
    manifest.webShards = {
      specs: ['test.spec.ts'],
      shards: [{ id: '1/1', specs: ['test.spec.ts'], estimatedMs: 1 }],
      shardCount: 1,
      fallback: false,
      estimatedTotalMs: 1,
    };
  manifest.unitShards = planUnitShards(manifest.scope.unit);
  manifest.digest = digest(manifest);
  const input = await createLaneInput({
    lane: 'governance',
    manifest,
    output: path.join(root, 'input.json'),
  });
  const summary = await observeLane({
    lane: 'governance',
    input,
    reportsDir: reports,
    output: path.join(root, 'summary.json'),
  });
  assert.equal(summary.status, 'failure');
  assert.equal(summary.timing.commandCount, 0);
  assert.deepEqual(summary.failures, [{ report: reports, classification: 'infrastructure' }]);
});
