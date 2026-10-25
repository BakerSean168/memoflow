#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { contractRoutedProjects, validateDeliveryManifest } from './lib/contracts.mjs';
import { UNIT_JOB_IDS, unitJobEnabled } from './lib/unit-shards.mjs';

const id = process.argv[2];
if (!UNIT_JOB_IDS.includes(id) || process.argv.length !== 3) {
  throw new Error('Usage: node run-unit-shard.mjs <unit-1|unit-2|unit-3>');
}
const manifest = validateDeliveryManifest(
  JSON.parse(await readFile(process.env.DELIVERY_MANIFEST_PATH, 'utf8')),
);
if (!unitJobEnabled(manifest, id)) throw new Error(`Manifest disabled ${id}`);
// Q4 routing moves the contracts TESTS to the Contract lane, but sibling
// suites in this shard resolve @memoflow/contracts/* subpaths to dist at
// runtime (previously an ambient side effect of contracts:test's build
// dependency in the same job). Build the artifact explicitly; do not run
// the tests here.
const shardProjects = manifest.unitShards
  .find((shard) => shard.id === id)
  .tasks.map((t) => t.project);
if (
  contractRoutedProjects({ scope: manifest.scope, laneDetails: manifest.laneDetails }).length > 0 &&
  !shardProjects.includes('contracts')
) {
  const build = spawnSync(
    'pnpm',
    ['exec', 'nx', 'run', 'contracts:build', '--outputStyle=static'],
    {
      stdio: 'inherit',
      env: { ...process.env },
      timeout: 10 * 60 * 1000,
    },
  );
  if (build.error) throw build.error;
  if (build.status !== 0) process.exit(build.status ?? 1);
}
// Merged coverage: when the manifest selects the coverage lane, projects
// in scope.coverage run their test:coverage target in place of test — the
// same suites with coverage collection, executed exactly once. CI Check
// verifies a successful coverage attempt per expected project from these
// reports, so a silently dropped project fails the gate.
const coverageProjects =
  manifest.lanes.coverage === true ? new Set(manifest.scope.coverage ?? []) : new Set();
for (const [index, task] of manifest.unitShards.find((shard) => shard.id === id).tasks.entries()) {
  const target = coverageProjects.has(task.project) ? 'test:coverage' : 'test';
  const result = spawnSync(
    process.execPath,
    [
      'tools/test-system-v2/run-command.mjs',
      '--',
      'pnpm',
      'exec',
      'nx',
      'run',
      `${task.project}:${target}`,
      '--outputStyle=static',
      // Keep the CPU budget explicit: native-flow tests retain their existing 5s deadlines.
      ...(task.shard ? [`--shard=${task.shard}`, '--maxWorkers=2'] : []),
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_REPORT_NAME: `${id}-${index}`,
        UNIT_SHARD_ID: id,
        TEST_RETRY_INFRASTRUCTURE: 'false',
      },
      timeout: 30 * 60 * 1000,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode ??= result.status ?? 1;
  }
}
