#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { validateDeliveryManifest } from './lib/contracts.mjs';
import { UNIT_JOB_IDS, unitJobEnabled } from './lib/unit-shards.mjs';

const id = process.argv[2];
if (!UNIT_JOB_IDS.includes(id) || process.argv.length !== 3) {
  throw new Error('Usage: node run-unit-shard.mjs <unit-1|unit-2|unit-3>');
}
const manifest = validateDeliveryManifest(
  JSON.parse(await readFile(process.env.DELIVERY_MANIFEST_PATH, 'utf8')),
);
if (!unitJobEnabled(manifest, id)) throw new Error(`Manifest disabled ${id}`);
for (const [index, task] of manifest.unitShards.find((shard) => shard.id === id).tasks.entries()) {
  const result = spawnSync(
    process.execPath,
    [
      'tools/test-system-v2/run-command.mjs',
      '--',
      'pnpm',
      'exec',
      'nx',
      'run',
      `${task.project}:test`,
      '--outputStyle=static',
      // Keep the CPU budget explicit: native-flow tests retain their existing 5s deadlines.
      ...(task.shard ? [`--shard=${task.shard}`, '--maxWorkers=2'] : []),
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_REPORT_NAME: `${id}-${index}`,
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
