#!/usr/bin/env node
/* eslint-disable @nx/enforce-module-boundaries -- the runner executes the Web-owned spec list */
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { WEB_FLOW_SPECS } from '../../apps/web/web-flow-specs.mjs';
import { planShards, planWarnings } from './lib/shard-balance.mjs';

export const WEB_SPEC_DURATIONS_PATH = 'tools/test-system-v2/web-spec-durations.json';

export function parseShardArgument(value) {
  const match = /^(\d+)\/(\d+)$/u.exec(value ?? '');
  if (!match) throw new Error(`Web Flow shard must look like <index>/<count>, got ${value}`);
  const index = Number(match[1]);
  const count = Number(match[2]);
  if (index < 1 || index > count) throw new Error(`Unknown Web Flow shard: ${value}`);
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
  const history = JSON.parse(await readFile(WEB_SPEC_DURATIONS_PATH, 'utf8'));
  const plan = planShards({ specs: WEB_FLOW_SPECS, durations: history.specs, shardCount: count });
  for (const warning of planWarnings(history, plan)) console.log(`::warning::${warning}`);
  const shard = plan.shards[index - 1];
  console.log(
    `[test-system-v2] Web Flow shard ${index}/${count}: ~${Math.round(shard.totalMs / 1000)}s, ${shard.specs.join(' ')}`,
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
  process.exitCode = exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
