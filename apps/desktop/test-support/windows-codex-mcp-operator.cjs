'use strict';
/**
 * #570 operator-only Windows Codex App Server acceptance.
 * Receives an ephemeral local MemoFlow MCP grant, never calls turn/start,
 * and uses no personal Codex Home / user account / production Goal owner.
 * Calls only bounded synthetic Goal panel capabilities from a test-only bridge.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

const url = process.env.MF570_MCP_URL;
const token = process.env.MF570_MCP_TOKEN;
const codex = process.env.MF570_CODEX_WIN_EXE;
// The temporary grant is scoped to the injected thread; do not propagate it as
// an ambient environment variable to the native Codex child process.
delete process.env.MF570_MCP_URL;
delete process.env.MF570_MCP_TOKEN;
const expected = [
  'goal_panel_snapshot',
  'goal_panel_open',
  'goal_panel_patch',
  'goal_panel_add_key_result',
  'goal_panel_remove_key_result',
  'goal_panel_focus',
  'goal_panel_submit',
  'goal_panel_release',
];
let child;
let homeRoot;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (
    !/^http:\/\/127\.0\.0\.1:\d+\/mcp$/.test(url || '') ||
    !/^[A-Za-z0-9_-]{43}$/.test(token || '') ||
    !codex
  ) {
    throw new Error('INVALID_EPHEMERAL_GRANT');
  }
  homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf570-codex-mcp-'));
  const home = path.join(homeRoot, 'empty-codex-home');
  fs.mkdirSync(home, { recursive: true });
  child = spawn(codex, ['app-server', '--listen', 'stdio://'], {
    cwd: homeRoot,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CODEX_HOME: home },
  });
  child.stderr.resume();
  child.stdin.on('error', () => {});
  const pending = new Map();
  let seq = 0;
  let exited = false;
  const rejectAll = () => {
    exited = true;
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('CODEX_PROCESS_EXIT'));
    }
    pending.clear();
  };
  child.once('error', rejectAll);
  child.once('exit', rejectAll);
  createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', (line) => {
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      return;
    }
    const target = pending.get(frame.id);
    if (!target) return;
    pending.delete(frame.id);
    clearTimeout(target.timer);
    if (frame.error) target.reject(new Error('RPC_ERROR_' + String(frame.error.code)));
    else target.resolve(frame.result);
  });
  function request(method, params = {}, timeoutMs = 12_000) {
    return new Promise((resolve, reject) => {
      if (exited) return reject(new Error('CODEX_PROCESS_EXIT'));
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('RPC_TIMEOUT_' + method));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }

  await request('initialize', {
    clientInfo: { name: 'memoflow-570-qa', title: 'MemoFlow 570 QA', version: '1' },
    capabilities: { experimentalApi: true },
  });
  console.log('NATIVE_CODEX_INITIALIZE=PASS');
  child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');

  const started = await request(
    'thread/start',
    {
      ephemeral: true,
      sandbox: 'read-only',
      approvalPolicy: 'never',
      cwd: homeRoot,
      model: 'gpt-6',
      config: {
        mcp_servers: {
          memoflow: { url, http_headers: { Authorization: 'Bearer ' + token } },
        },
      },
    },
    20_000,
  );
  const threadId = started?.thread?.id;
  if (!threadId) throw new Error('NO_EPHEMERAL_THREAD');
  console.log('EPHEMERAL_THREAD=PASS');

  let status;
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await request('mcpServerStatus/list', {
      threadId,
      serverName: 'memoflow',
      detail: 'toolsAndAuthOnly',
      limit: 20,
    });
    status = (result.data || []).find((entry) => entry.name === 'memoflow');
    if (
      status?.runtimeStatus === 'connected' &&
      expected.every((tool) => tool in (status.tools || {}))
    )
      break;
    await sleep(300);
  }
  const actual = Object.keys(status?.tools || {});
  const complete = expected.every((name) => actual.includes(name));
  console.log('MCP_SERVER_CONNECTED=' + Boolean(status?.runtimeStatus === 'connected'));
  console.log(
    'DISCOVERED_GOAL_PANEL_TOOLS=' + expected.filter((name) => actual.includes(name)).length,
  );
  if (!complete || status?.runtimeStatus !== 'connected') {
    throw new Error('GOAL_PANEL_TOOLS_NOT_CONNECTED');
  }

  const snapshot = await request(
    'mcpServer/tool/call',
    { server: 'memoflow', threadId, tool: 'goal_panel_snapshot', arguments: {} },
    15_000,
  );
  const snapshotOk = !snapshot?.isError && snapshot?.structuredContent?.snapshot;
  console.log('CODEX_GOAL_SNAPSHOT_CALL=' + Boolean(snapshotOk));
  if (!snapshotOk) throw new Error('NATIVE_SNAPSHOT_TOOL_FAILED');

  const open = await request(
    'mcpServer/tool/call',
    { server: 'memoflow', threadId, tool: 'goal_panel_open', arguments: { mode: 'create' } },
    15_000,
  );
  const openOk = !open?.isError && open?.structuredContent?.snapshot;
  console.log('CODEX_GOAL_OPEN_CALL=' + Boolean(openOk));
  if (!openOk) throw new Error('NATIVE_OPEN_TOOL_FAILED');

  console.log('NATIVE_MODEL_TURNS=0');
  console.log('WIN_REAL_CODEX_MEMOFLOW_MCP=PASS');
}

(async () => {
  const watchdog = setTimeout(() => {
    console.log('QA_TIMED_OUT=true');
    child?.kill();
    process.exitCode = 2;
  }, 55_000);
  watchdog.unref();
  try {
    await main();
  } catch (error) {
    // Only high-level failure codes. No grant token, account identity, or endpoint is logged.
    console.log(
      'WIN_REAL_CODEX_MEMOFLOW_MCP=FAIL_' + String(error?.message || 'UNKNOWN').slice(0, 96),
    );
    process.exitCode = 1;
  } finally {
    clearTimeout(watchdog);
    if (child && child.exitCode === null) {
      child.kill();
      await Promise.race([new Promise((resolve) => child.once('close', resolve)), sleep(2000)]);
    }
    let removed = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        if (homeRoot)
          fs.rmSync(homeRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
        removed = true;
        break;
      } catch {
        await sleep(350);
      }
    }
    console.log('EPHEMERAL_CODEX_HOME_REMOVED=' + removed);
  }
})().catch(() => {
  process.exitCode = 1;
});
