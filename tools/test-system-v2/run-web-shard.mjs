#!/usr/bin/env node
/* eslint-disable @nx/enforce-module-boundaries -- the runner executes the Web-owned spec list */
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { validateDeliveryManifest } from '../ci-cd-platform/lib/contracts.mjs';
import { executedWebSpecs } from './lib/web-shards.mjs';
import { medianDuration, planWarnings } from './lib/shard-balance.mjs';

export const WEB_SPEC_DURATIONS_PATH = 'tools/test-system-v2/web-spec-durations.json';

export function parseShardArgument(value) {
  const match = /^(\d+)\/(\d+)$/u.exec(value ?? '');
  if (!match) throw new Error(`Web Flow shard must look like <index>/<count>, got ${value}`);
  const index = Number(match[1]);
  const count = Number(match[2]);
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index < 1 || index > count)
    throw new Error(`Unknown Web Flow shard: ${value}`);
  return { index, count };
}

function findFreeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate a loopback port for the Web Flow provider mock.'));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function main() {
  const { index, count } = parseShardArgument(process.argv[2]);
  const manifest = validateDeliveryManifest(
    JSON.parse(await readFile('scope/delivery-manifest-v1.json', 'utf8')),
  );
  if (!manifest.lanes.web || count !== manifest.webShards.shardCount)
    throw new Error('Web shard count differs from manifest');
  const shard = manifest.webShards.shards[index - 1];
  const history = JSON.parse(await readFile(WEB_SPEC_DURATIONS_PATH, 'utf8'));
  const knownDurations = Object.values(history.specs).map((entry) => entry.durationMs);
  const warnings = planWarnings(history, {
    defaultMs: medianDuration(knownDurations),
    missing: manifest.webShards.specs.filter(
      (spec) =>
        !Number.isFinite(history.specs[spec]?.durationMs) || history.specs[spec].durationMs <= 0,
    ),
  });
  for (const warning of warnings) console.log(`::warning::${warning}`);
  console.log(
    `[test-system-v2] Web Flow shard ${index}/${count}: ~${Math.round(shard.estimatedMs / 1000)}s, ${shard.specs.join(' ')}`,
  );

  const mockPort = process.env.E2E_OPENAI_MOCK_PORT || String(await findFreeLoopbackPort());
  console.log(`[test-system-v2] Web Flow OpenAI mock port: ${mockPort}`);

  const args = [
    'exec',
    'playwright',
    'test',
    '--config',
    'playwright.config.ts',
    ...shard.specs.map((spec) => `e2e/${spec}`),
  ];
  await rm('apps/web/test-results/results.json', { force: true });
  const exitCode = await new Promise((resolve) => {
    const child = spawn('pnpm', args, {
      cwd: 'apps/web',
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, E2E_OPENAI_MOCK_PORT: mockPort },
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
  // Capture before visual/provider suites overwrite the shared JSON reporter.
  const report = JSON.parse(await readFile('apps/web/test-results/results.json', 'utf8'));
  await mkdir('reports/web-shards', { recursive: true });
  await writeFile(
    `reports/web-shards/shard-${index}.json`,
    JSON.stringify(
      {
        id: `${index}/${count}`,
        runId: process.env.GITHUB_RUN_ID ?? 'local',
        runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 1),
        manifestDigest: manifest.digest,
        exitCode,
        specs: executedWebSpecs(report),
      },
      null,
      2,
    ),
  );
  process.exitCode = exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
