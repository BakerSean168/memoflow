#!/usr/bin/env node
/** Optional WSL loopback-only Storybook bridge; never changes host networking. */
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStorybookProcess } from './storybook-process.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = fileURLToPath(import.meta.url);
const port = 4402;
const isWSL = process.platform === 'linux' && /microsoft/i.test(os.release());
const mode = process.argv[2] ?? process.env.MEMOFLOW_STORYBOOK_NETNS ?? 'auto';
if (!['auto', 'on', 'off', 'inside'].includes(mode) || process.argv.length > 3) {
  throw new Error('MEMOFLOW_STORYBOOK_NETNS must be auto, on, or off.');
}
const storybookArgs = [
  path.join(root, 'node_modules/storybook/dist/bin/dispatcher.js'),
  'dev',
  '-p',
  String(port),
  '-c',
  'apps/storybook/.storybook',
  '--no-open',
];
const env = { ...process.env, STORYBOOK_DISABLE_TELEMETRY: '1' };
const connections = new Set();
function relay(client, target) {
  for (const socket of [client, target]) {
    connections.add(socket);
    socket.on('close', () => {
      connections.delete(socket);
      client.destroy();
      target.destroy();
    });
    socket.on('error', () => {
      client.destroy();
      target.destroy();
    });
  }
  client.pipe(target).pipe(client);
}
async function listen(server, ...args) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(...args, resolve);
  });
}
function close(server) {
  for (const socket of connections) socket.destroy();
  server.close();
}

if (mode === 'inside') {
  const socketPath = process.env.MEMOFLOW_STORYBOOK_SOCKET_PATH;
  if (!socketPath) throw new Error('The isolated bridge requires a private socket path.');
  const server = net.createServer((client) =>
    relay(client, net.connect({ host: '127.0.0.1', port })),
  );
  try {
    await listen(server, socketPath);
    chmodSync(socketPath, 0o600);
    process.exitCode = await startStorybookProcess(process.execPath, storybookArgs, {
      cwd: root,
      env,
    }).done;
  } finally {
    close(server);
    rmSync(socketPath, { force: true });
  }
} else if (mode === 'on' || (mode === 'auto' && isWSL)) {
  if (process.platform !== 'linux') throw new Error('Network namespaces require Linux.');
  const directory = mkdtempSync(path.join(os.tmpdir(), 'memoflow-storybook-'));
  const socketPath = path.join(directory, 'bridge.sock');
  const server = net.createServer((client) => relay(client, net.connect(socketPath)));
  try {
    // Bind first: an occupied port must fail before creating a child process.
    await listen(server, port, '127.0.0.1');
    console.log(
      `[Storybook WSL] http://127.0.0.1:${port}; loopback only, external resources unavailable.`,
    );
    process.exitCode = await startStorybookProcess(
      'unshare',
      [
        '-Urn',
        '--',
        'sh',
        '-c',
        'ip link set lo up && exec "$@"',
        'storybook-wsl',
        process.execPath,
        script,
        'inside',
      ],
      { cwd: root, env: { ...env, MEMOFLOW_STORYBOOK_SOCKET_PATH: socketPath } },
    ).done;
  } finally {
    close(server);
    rmSync(directory, { recursive: true, force: true });
  }
} else {
  process.exitCode = await startStorybookProcess(process.execPath, storybookArgs, {
    cwd: root,
    env,
  }).done;
}
