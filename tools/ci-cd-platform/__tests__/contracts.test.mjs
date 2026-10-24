import { planUnitShards } from '../lib/unit-shards.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildProvenance,
  digest,
  validateDeliveryManifest,
  validateLaneInput,
  validateLaneResult,
  validateRunSummary,
} from '../lib/contracts.mjs';

const scope = {
  version: 1,
  base: 'base',
  head: 'head',
  full: false,
  projects: ['web'],
  unit: ['web'],
  coverage: [],
  smoke: [],
  integration: [],
  boundary: [],
  perf: [],
  webFlow: true,
  desktopFlow: false,
};

test('validates a delivery manifest and gives deterministic provenance', () => {
  const input = { head: 'head', files: ['apps/web/src/App.vue'] };
  const manifest = {
    kind: 'delivery-manifest-v1',
    version: 1,
    commit: 'head',
    base: 'base',
    head: 'head',
    event: 'pull_request',
    full: false,
    changedFiles: input.files,
    risk: {
      level: 'web-flow',
      reasons: ['Web application or browser flow changed'],
      matchedLevels: ['web-flow'],
    },
    scope,
    lanes: {
      governance: true,
      validate: true,
      boundary: false,
      integration: false,
      web: true,
      coverage: false,
      performance: false,
    },
    provenance: buildProvenance({ generator: 'test', input }),
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
  validateDeliveryManifest(manifest);
  assert.equal(digest(input), digest({ files: input.files, head: input.head }));
  assert.match(manifest.provenance.inputDigest, /^[a-f0-9]{64}$/u);
});

test('rejects missing or unsupported contract fields', () => {
  assert.throws(
    () => validateDeliveryManifest({ kind: 'delivery-manifest-v1', version: 2 }),
    /unsupported manifest version/,
  );
  assert.throws(() => validateLaneInput({ kind: 'lane-input-v1', version: 1 }), /lane must be/);
  assert.throws(
    () =>
      validateLaneResult({
        kind: 'lane-result-v1',
        version: 1,
        lane: 'web',
        commit: 'x',
        manifestDigest: 'a'.repeat(64),
        status: 'unknown',
      }),
    /invalid lane status/,
  );
});

test('rejects a scope that was calculated from a different affected range', () => {
  const manifest = {
    kind: 'delivery-manifest-v1',
    version: 1,
    commit: 'head',
    base: 'base',
    head: 'head',
    event: 'pull_request',
    full: false,
    changedFiles: [],
    risk: { level: 'docs', reasons: [] },
    scope: { ...scope, base: 'other-base' },
    lanes: { governance: true, validate: true },
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
  assert.throws(() => validateDeliveryManifest(manifest), /scope\.base must match/);
});

test('accepts a complete lane input and result', () => {
  const input = {
    kind: 'lane-input-v1',
    version: 1,
    lane: 'web',
    commit: 'head',
    manifestDigest: 'a'.repeat(64),
    inputs: ['apps/web'],
    outputs: ['results.json'],
    environment: { isolation: 'dedicated' },
    cache: { read: ['playwright'], write: [] },
    failurePolicy: { retry: 'infrastructure-only', timeoutMinutes: 30 },
    owner: 'web',
    capabilities: ['node', 'pnpm'],
    policy: {},
    scope: { version: 1, projects: [] },
    risk: { level: 'docs' },
  };
  input.digest = digest(input);
  validateLaneInput(input);
  const result = {
    kind: 'lane-result-v1',
    version: 1,
    lane: 'web',
    commit: 'head',
    manifestDigest: 'a'.repeat(64),
    laneInputDigest: input.digest,
    status: 'success',
    failure: { classification: 'none' },
    timing: { setupMs: 1, executionMs: 2 },
    provenance: { runner: 'ubuntu-latest' },
  };
  result.digest = digest(result);
  validateLaneResult(result);
});

test('run summary timing rejects invalid measurements', () => {
  const summary = {
    kind: 'run-summary-v1',
    version: 1,
    commit: 'head',
    manifestDigest: 'a'.repeat(64),
    status: 'success',
    lanes: [],
    missingLanes: [],
    timing: {
      setupMs: 1,
      executionMs: 2,
      longestLaneMs: 2,
      wallClockMs: null,
      runnerMinutes: null,
    },
    provenance: { generator: 'test' },
  };
  summary.digest = digest(summary);
  validateRunSummary(summary);
  const invalid = { ...summary, timing: { ...summary.timing, setupMs: -1 } };
  invalid.digest = digest(invalid);
  assert.throws(() => validateRunSummary(invalid), /timing\.setupMs must be non-negative/);
});

test('Prisma client generation has one Nx-owned writer in the typecheck graph', async () => {
  const [databaseProject, apiProject] = await Promise.all([
    readFile(new URL('../../../packages/database/project.json', import.meta.url), 'utf8').then(
      JSON.parse,
    ),
    readFile(new URL('../../../apps/api/project.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);

  const databaseBuild = databaseProject.targets.build;
  const databaseTypecheck = databaseProject.targets.typecheck;
  const apiTypecheck = apiProject.targets.typecheck;

  assert.ok(databaseBuild.dependsOn.includes('prisma-generate'));
  assert.doesNotMatch(databaseBuild.options.command, /prisma generate/u);
  assert.ok(databaseTypecheck.dependsOn.includes('prisma-generate'));

  assert.ok(
    apiTypecheck.dependsOn.some(
      (dependency) =>
        typeof dependency === 'object' &&
        dependency.target === 'prisma-generate' &&
        Array.isArray(dependency.projects) &&
        dependency.projects.includes('database'),
    ),
  );
  assert.equal(apiProject.targets['prisma:generate'], undefined);
});

test('laneDetails validation enforces shape and lane consistency (VNext Q2)', async () => {
  const { validateDeliveryManifest } = await import('../lib/contracts.mjs');
  const { buildDeliveryManifest } = await import('../generate-delivery-manifest.mjs');
  const scope = {
    version: 1, base: 'base', head: 'head', full: false, projects: ['web'], unit: ['web'],
    coverage: [], smoke: [], integration: [], boundary: [], perf: [], webFlow: true, desktopFlow: false,
  };
  const good = await buildDeliveryManifest({ base: 'base', head: 'head', scope, files: ['apps/web/src/main.ts'] });
  assert.doesNotThrow(() => validateDeliveryManifest(good));
  const unknown = structuredClone(good);
  unknown.laneDetails.bogusCapability = { required: true, files: [], targets: [], skipReason: null };
  assert.throws(() => validateDeliveryManifest(unknown), /unsupported capability/);
  const badReason = structuredClone(good);
  badReason.laneDetails.fmt.skipReason = 'should not be set';
  if (badReason.laneDetails.fmt.required) {
    assert.throws(() => validateDeliveryManifest(badReason), /must be null when required/);
  }
});
