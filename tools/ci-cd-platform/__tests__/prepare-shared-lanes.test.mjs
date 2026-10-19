import { planUnitShards } from '../lib/unit-shards.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareSharedLanes } from '../prepare-shared-lanes.mjs';
import { digest, validateWorkspaceReceipt } from '../lib/contracts.mjs';

function createReceipt(setupMs = 101) {
  const receipt = {
    kind: 'workspace-receipt-v1',
    version: 1,
    commit: 'head',
    runner: { os: 'linux' },
    toolchain: { node: 'v24' },
    capabilities: ['node', 'pnpm'],
    cache: {},
    timing: { setupMs },
    provenance: { generator: 'test', inputDigest: 'd'.repeat(64) },
  };
  receipt.digest = digest(receipt);
  return receipt;
}

test('prepares independent lane inputs and apportions shared setup timing', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'memoflow-shared-lanes-'));
  const manifest = {
    kind: 'delivery-manifest-v1',
    version: 1,
    commit: 'head',
    base: 'base',
    head: 'head',
    event: 'pull_request',
    full: true,
    changedFiles: [],
    risk: { level: 'root', reasons: ['test'], matchedLevels: ['root'] },
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
      boundary: true,
      integration: true,
      web: false,
      coverage: false,
      performance: false,
    },
    provenance: { generator: 'test', inputDigest: 'c'.repeat(64) },
  };
  manifest.unitShards = planUnitShards(manifest.scope.unit);
  manifest.digest = digest(manifest);
  const enabled = await prepareSharedLanes({
    manifest,
    receipt: createReceipt(),
    lanes: ['boundary', 'integration', 'boundary', 'coverage'],
    outputDir,
  });
  assert.deepEqual(enabled, ['boundary', 'integration']);
  const boundaryReceipt = JSON.parse(
    await readFile(path.join(outputDir, 'boundary-workspace-receipt.json'), 'utf8'),
  );
  assert.equal(boundaryReceipt.timing.setupMs, 51);
  assert.equal(boundaryReceipt.sharedWorkspace.lane, 'boundary');
  assert.equal(boundaryReceipt.sharedWorkspace.laneCount, 2);
  assert.equal(validateWorkspaceReceipt(boundaryReceipt), boundaryReceipt);
  const integrationReceipt = JSON.parse(
    await readFile(path.join(outputDir, 'integration-workspace-receipt.json'), 'utf8'),
  );
  assert.equal(integrationReceipt.timing.setupMs, 50);
  assert.equal(validateWorkspaceReceipt(integrationReceipt), integrationReceipt);
  assert.equal(boundaryReceipt.timing.setupMs + integrationReceipt.timing.setupMs, 101);
  const input = JSON.parse(
    await readFile(path.join(outputDir, 'integration-input-v1.json'), 'utf8'),
  );
  assert.equal(input.lane, 'integration');
});

test('rejects unregistered lanes before producing shared lane evidence', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'memoflow-shared-lanes-'));
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
    provenance: { generator: 'test', inputDigest: 'e'.repeat(64) },
  };
  manifest.unitShards = planUnitShards(manifest.scope.unit);
  manifest.digest = digest(manifest);
  await assert.rejects(
    prepareSharedLanes({ manifest, receipt: createReceipt(), lanes: ['unknown'], outputDir }),
    /Unknown delivery lane: unknown/,
  );
});
