#!/usr/bin/env node
/**
 * Test-owned fake of the official Antigravity ACP server.
 *
 * It speaks ACP JSON-RPC over stdio and owns a real loopback OAuth listener, so
 * the explicit login flow can be exercised without Google, Windows or the
 * official binary. A token file is written only after a correctly stated
 * callback arrives; `session/new` reports models only when that file exists.
 */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const readline = require('node:readline');

const home = process.env.GEMINI_HOME;
if (!home) {
  process.stderr.write('GEMINI_HOME is required\n');
  process.exit(3);
}
const tokenPath = path.join(home, 'antigravity-acp', 'acp_token.json');
const AUTH_PREFIX = 'Open the following link to authenticate the ACP server: ';
const MODEL_ID = 'fixture-google-model';

const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
const hasToken = () => {
  try {
    return fs.statSync(tokenPath).isFile();
  } catch {
    return false;
  }
};

let listener;
let pendingState;
let pendingAuth;
let callbackSeen = false;

function closeListener() {
  if (listener) {
    listener.close();
    listener = undefined;
  }
}

function emitAuthorizationUrl() {
  if (!listener) {
    process.stderr.write('authorization listener is not ready\n');
    process.exit(4);
  }
  const port = listener.address().port;
  pendingState = `fixture-state-${Math.random().toString(16).slice(2)}`;
  const redirect = `http://127.0.0.1:${port}/`;
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth?client_id=fixture-client' +
    `&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=openid` +
    `&state=${pendingState}`;
  process.stdout.write(`${AUTH_PREFIX}${url}\n`);
  return url;
}

function startListener() {
  return new Promise((resolve) => {
    listener = http.createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method !== 'GET' || url.pathname !== '/') {
        response.statusCode = 404;
        response.end();
        return;
      }
      const state = url.searchParams.getAll('state');
      const code = url.searchParams.getAll('code');
      if (callbackSeen) {
        response.statusCode = 409;
        response.end();
        return;
      }
      if (state.length !== 1 || state[0] !== pendingState || code.length !== 1 || !code[0]) {
        response.statusCode = 400;
        response.end();
        return;
      }
      callbackSeen = true;
      fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
      fs.writeFileSync(
        tokenPath,
        JSON.stringify({
          client_id: 'fixture-client',
          refresh_token: 'fixture-refresh-token',
          access_token: 'fixture-access-token',
        }),
      );
      response.statusCode = 200;
      response.end('signed in');
      const resolve = pendingAuth;
      pendingAuth = undefined;
      resolve?.();
    });
    listener.listen(0, '127.0.0.1', () => resolve(undefined));
  });
}

function authenticate() {
  if (hasToken()) return Promise.resolve();
  const url = emitAuthorizationUrl();
  if (!url) return Promise.reject(new Error('no authorization URL'));
  return new Promise((resolve) => {
    pendingAuth = resolve;
    setTimeout(() => {
      if (!pendingAuth) return;
      pendingAuth = undefined;
      process.exit(5);
    }, 120_000).unref();
  });
}

const session = () => ({
  sessionId: 'fixture-session',
  modes: { currentModeId: 'default', availableModes: [{ id: 'default' }] },
  configOptions: [
    {
      id: 'model',
      category: 'model',
      type: 'select',
      currentValue: MODEL_ID,
      options: [{ value: MODEL_ID, name: 'Fixture Google Model' }],
    },
  ],
});

async function handle(frame) {
  if (typeof frame.method !== 'string') return;
  if (frame.id === undefined) return;
  switch (frame.method) {
    case 'initialize':
      reply(frame.id, {
        protocolVersion: 1,
        agentInfo: { name: 'agy-fixture', version: 'agy_acp_server_1.4.0' },
        agentCapabilities: {
          mcpCapabilities: { http: true },
          sessionCapabilities: { resume: {}, close: {} },
          auth: { logout: {} },
        },
      });
      return;
    case 'authenticate':
      try {
        await authenticate();
        reply(frame.id, {});
      } catch {
        fail(frame.id, -32000, 'authentication_failed');
      }
      return;
    case 'session/new':
      if (!hasToken()) {
        process.stdout.write(`${AUTH_PREFIX}https://accounts.google.com/o/oauth2/v2/auth?state=missing\n`);
        process.exit(0);
      }
      reply(frame.id, session());
      return;
    case 'session/close':
      reply(frame.id, {});
      return;
    case 'logout':
      fs.rmSync(tokenPath, { force: true });
      reply(frame.id, {});
      return;
    default:
      fail(frame.id, -32601, 'unsupported method');
  }
}

async function main() {
  await startListener();
  const input = readline.createInterface({ input: process.stdin });
  input.on('line', (line) => {
    if (!line.trim()) return;
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      process.exit(6);
    }
    void handle(frame);
  });
  input.on('close', () => {
    closeListener();
    process.exit(0);
  });
}

process.on('SIGTERM', () => {
  closeListener();
  process.exit(0);
});

void main();
