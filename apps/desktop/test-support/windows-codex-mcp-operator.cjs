'use strict';
/**
 * #570 operator-only Windows Codex App Server acceptance.
 * Receives an ephemeral local MemoFlow MCP grant, never calls turn/start,
 * and uses no personal Codex Home / user account / production Goal owner.
 * Supports an opt-in full installed Windows Goal owner route via a test-only
 * Electron IPC relay. The native Codex App Server genuinely issues each MCP
 * tool/call; no Codex language-model turns are started.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createInterface } = require('node:readline');

const EXPECTED_TOOLS = [
  'goal_panel_snapshot',
  'goal_panel_open',
  'goal_panel_patch',
  'goal_panel_add_key_result',
  'goal_panel_remove_key_result',
  'goal_panel_focus',
  'goal_panel_submit',
  'goal_panel_release',
];

// Windows releases the CODEX_HOME file handles asynchronously after the process
// tree is gone, and Defender/AV scans can extend that. The old fixed 6 x 350ms
// window (~2.1s) was too short; this budget backs off for up to 15s.
const CLEANUP_MAX_ATTEMPTS = 30;
const CLEANUP_BASE_DELAY_MS = 250;
const CLEANUP_MAX_DELAY_MS = 2_000;
const CLEANUP_DEADLINE_MS = 15_000;
const CLEANUP_RESIDUAL_LIMIT = 20;
const GRACEFUL_EXIT_MS = 3_000;
const FORCED_EXIT_MS = 5_000;

let child;
let childDetached = false;
let homeRoot;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Kill the whole process tree, not only the direct child. On Windows the Codex
 * App Server can leave descendants behind; `taskkill /T` terminates the subtree
 * while `child.kill()` only signals the direct process.
 */
function killProcessTree(pid, options = {}) {
  const platform = options.platform ?? process.platform;
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (platform === 'win32') {
    const run = options.spawnSyncImpl ?? spawnSync;
    const result = run('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 15_000,
    });
    return result?.status === 0;
  }
  let killed = false;
  // A detached child owns its process group, so the negative PID reaches every
  // descendant. Never do this for a non-detached child: -pid would be our own
  // process group.
  if (options.detached) {
    try {
      process.kill(-pid, 'SIGKILL');
      killed = true;
    } catch {}
  }
  try {
    process.kill(pid, 'SIGKILL');
    killed = true;
  } catch {}
  return killed;
}

/** Resolve true when the direct child has exited, false when the timeout wins. */
function waitForChildExit(target, timeoutMs) {
  if (!target) return Promise.resolve(true);
  if (target.exitCode !== null || target.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      target.removeListener('exit', onExit);
      target.removeListener('close', onExit);
      resolve(value);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref?.();
    target.once('exit', onExit);
    target.once('close', onExit);
  });
}

/** Relative path + size of whatever still blocks deletion, for failure reports. */
function listResidualEntries(root, fsImpl = fs, limit = CLEANUP_RESIDUAL_LIMIT) {
  const entries = [];
  const walk = (dir, prefix) => {
    if (entries.length >= limit) return;
    let dirents;
    try {
      dirents = fsImpl.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (entries.length >= limit) return;
      const relative = prefix ? prefix + '/' + dirent.name : dirent.name;
      const absolute = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        entries.push(relative + '/');
        walk(absolute, relative);
      } else {
        let size = 'unknown';
        try {
          size = String(fsImpl.statSync(absolute).size);
        } catch {}
        entries.push(relative + ' (' + size + ' bytes)');
      }
    }
  };
  walk(root, '');
  if (entries.length >= limit) entries.push('... (truncated)');
  return entries;
}

/**
 * Delete the ephemeral CODEX_HOME until `existsSync` proves the path is gone.
 * A successful `rmSync` is not proof on Windows: a locked handle can leave the
 * directory behind, so only the existence check may report success.
 */
async function removeEphemeralHome(root, options = {}) {
  const fsImpl = options.fsImpl ?? fs;
  const sleepImpl = options.sleepImpl ?? sleep;
  const maxAttempts = options.maxAttempts ?? CLEANUP_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? CLEANUP_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? CLEANUP_MAX_DELAY_MS;
  const deadlineMs = options.deadlineMs ?? CLEANUP_DEADLINE_MS;
  const startedAt = Date.now();
  let attempts = 0;
  let lastError = null;
  if (!root) return { removed: true, attempts, residual: [], lastError };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (!fsImpl.existsSync(root)) return { removed: true, attempts, residual: [], lastError };
    attempts += 1;
    try {
      fsImpl.rmSync(root, {
        recursive: true,
        force: true,
        maxRetries: 2,
        retryDelay: 100,
      });
    } catch (error) {
      lastError = error;
    }
    if (!fsImpl.existsSync(root)) return { removed: true, attempts, residual: [], lastError };
    if (Date.now() - startedAt >= deadlineMs) break;
    await sleepImpl(Math.min(baseDelayMs * attempts, maxDelayMs));
  }

  return {
    removed: false,
    attempts,
    residual: listResidualEntries(root, fsImpl),
    lastError,
  };
}

async function main() {
  const url = process.env.MF570_MCP_URL;
  const token = process.env.MF570_MCP_TOKEN;
  const codex = process.env.MF570_CODEX_WIN_EXE;
  const runIntegratedOwner = process.env.MF570_INTEGRATED_GOAL === 'CONFIRM_REAL_RENDERER_NO_TURN';
  // The temporary grant is scoped to the injected thread; do not propagate it as
  // an ambient environment variable to the native Codex child process.
  delete process.env.MF570_MCP_URL;
  delete process.env.MF570_MCP_TOKEN;
  const expected = EXPECTED_TOOLS;

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
  childDetached = process.platform !== 'win32';
  child = spawn(codex, ['app-server', '--listen', 'stdio://'], {
    cwd: homeRoot,
    windowsHide: true,
    detached: childDetached,
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

  if (runIntegratedOwner) {
    const goalName = 'QA 570 Windows Codex MCP to real Goal owner';
    const utcDay = (daysFromNow) =>
      new Date(Date.now() + daysFromNow * 86400_000).toISOString().slice(0, 10);
    async function callTool(name, args, shouldFail = false) {
      const response = await request(
        'mcpServer/tool/call',
        { server: 'memoflow', threadId, tool: name, arguments: args },
        19_000,
      );
      if (shouldFail) {
        if (!response?.isError) throw new Error('EXPECTED_PANEL_ERROR_MISSING');
      } else if (response?.isError || !response?.structuredContent) {
        throw new Error('REAL_GOAL_PANEL_TOOL_FAILED_' + name);
      }
      return response?.structuredContent || {};
    }

    const patch = await callTool('goal_panel_patch', {
      expectedRevision: open.structuredContent.snapshot.revision,
      name: goalName,
      summary: 'Real Codex native MCP tool call, actual Windows Goal form',
      description: 'Written only into an isolated test Profile using real native tool RPC.',
      start: { kind: 'day', date: utcDay(3) },
      target: { kind: 'day', date: utcDay(45) },
    });
    const filled = patch.snapshot;
    if (filled?.fields?.name !== goalName || !filled.isControlled || !filled.dirty)
      throw new Error('REAL_GOAL_PATCH_NOT_APPLIED');
    const stale = await callTool(
      'goal_panel_patch',
      { expectedRevision: open.structuredContent.snapshot.revision, name: 'stale-overwrite' },
      true,
    );
    if (stale?.error?.code !== 'REVISION_CONFLICT')
      throw new Error('REAL_GOAL_REVISION_FENCE_BROKEN');

    let revision = filled.revision;
    const titles = ['Read 12 technical papers', 'Complete 24 coding exercises'];
    for (const title of titles) {
      const result = await callTool('goal_panel_add_key_result', {
        expectedRevision: revision,
        keyResult: {
          title,
          calculationMethod: 'Sum',
          initialValue: 0,
          targetValue: 12,
          weight: 3,
        },
      });
      revision = result.snapshot?.revision;
    }
    const before = await callTool('goal_panel_snapshot', {});
    if (
      before.snapshot?.keyResults?.length !== 2 ||
      !before.snapshot.isControlled ||
      before.snapshot.fields?.name !== goalName
    ) {
      throw new Error('REAL_GOAL_SNAPSHOT_MISMATCH');
    }
    const saved = await callTool('goal_panel_submit', { expectedRevision: revision });
    const goalId = saved.submitResult?.goalId;
    if (!goalId || saved.submitResult?.name !== goalName)
      throw new Error('REAL_GOAL_OWNER_RECEIPT_INVALID');
    await callTool('goal_panel_submit', {}, true);
    console.log(
      'NATIVE_OWNER_PROOF_JSON=' +
        JSON.stringify({ goalId, goalName, keyResultTitles: titles, modelTurns: 0 }),
    );
    console.log('REAL_CODEX_TO_GOAL_OWNER_RPC=PASS');
  }

  console.log('NATIVE_MODEL_TURNS=0');
  console.log('WIN_REAL_CODEX_MEMOFLOW_MCP=PASS');
}

async function run() {
  const watchdog = setTimeout(() => {
    console.log('QA_TIMED_OUT=true');
    if (child?.pid) killProcessTree(child.pid, { detached: childDetached });
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
    if (child && child.exitCode === null && child.signalCode === null) {
      // Closing stdio asks the App Server to shut down cleanly and release its
      // CODEX_HOME handles before we resort to killing the tree.
      try {
        child.stdin.end();
      } catch {}
      const graceful = await waitForChildExit(child, GRACEFUL_EXIT_MS);
      if (!graceful && child.pid) {
        killProcessTree(child.pid, { detached: childDetached });
        await waitForChildExit(child, FORCED_EXIT_MS);
      }
    }
    const cleanup = await removeEphemeralHome(homeRoot);
    console.log('EPHEMERAL_CODEX_HOME_REMOVED=' + cleanup.removed);
    console.log('EPHEMERAL_CODEX_HOME_REMOVE_ATTEMPTS=' + cleanup.attempts);
    if (!cleanup.removed) {
      const reason = String(cleanup.lastError?.code || cleanup.lastError?.message || 'UNKNOWN');
      console.log('EPHEMERAL_CODEX_HOME_LAST_ERROR=' + reason.slice(0, 96));
      console.log('EPHEMERAL_CODEX_HOME_RESIDUAL_COUNT=' + cleanup.residual.length);
      for (const entry of cleanup.residual) {
        console.log('EPHEMERAL_CODEX_HOME_RESIDUAL=' + entry);
      }
      // The spec asserts the removal line is `true`; a non-zero exit surfaces the
      // attached operator stdout instead of a bare assertion diff.
      if (!process.exitCode) process.exitCode = 1;
    }
  }
}

if (require.main === module) {
  run().catch(() => {
    process.exitCode = 1;
  });
}

module.exports = {
  killProcessTree,
  listResidualEntries,
  removeEphemeralHome,
  waitForChildExit,
};
