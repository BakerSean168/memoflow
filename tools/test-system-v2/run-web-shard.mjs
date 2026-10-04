#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const shardNumber = Number.parseInt(process.argv[2], 10);
const manifest = JSON.parse(await readFile('tools/test-system-v2/web-shards.json', 'utf8'));
const shard = manifest.shards.find((entry) => entry.shard === shardNumber);
if (!shard) throw new Error(`Unknown Web Flow shard: ${process.argv[2]}`);
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
