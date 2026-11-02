import { execFile, execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import fs, { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { LocalAgentRepository } from '@memoflow/ai';
import { createTimeContext } from '@memoflow/time';
import { createPowerSyncSqliteFixture } from '@memoflow/test-utils/helpers/powersync-sqlite';
import type { NativePanelIpcResponse } from '@memoflow/ai-contracts';
import type { IDesktopNativePanelBridge } from './desktop-native-panel-bridge';
import { createDesktopLocalAgentTools } from './local-agent-tools';

const execFileAsync = promisify(execFile);

type OperatorFs = {
  existsSync: (target: string) => boolean;
  rmSync: (target: string, options: object) => void;
  readdirSync: (target: string, options: object) => unknown;
  statSync: (target: string) => { size: number };
};

type OperatorCleanupResult = {
  removed: boolean;
  attempts: number;
  residual: string[];
  lastError: Error | null;
};

type OperatorModule = {
  removeEphemeralHome(
    root: string | undefined,
    options?: {
      fsImpl?: OperatorFs;
      sleepImpl?: (ms: number) => Promise<void>;
      maxAttempts?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
      deadlineMs?: number;
    },
  ): Promise<OperatorCleanupResult>;
  killProcessTree(
    pid: number,
    options?: {
      platform?: string;
      detached?: boolean;
      spawnSyncImpl?: (
        command: string,
        args: string[],
        options?: object,
      ) => { status?: number | null };
    },
  ): boolean;
  waitForChildExit(target: unknown, timeoutMs: number): Promise<boolean>;
};

// Load the operator as plain CommonJS: its top-level entrypoint is guarded by
// `require.main === module`, so requiring it only exposes the cleanup helpers.
const operator = createRequire(import.meta.url)(
  path.resolve(import.meta.dirname, '../../../../test-support/windows-codex-mcp-operator.cjs'),
) as OperatorModule;

/**
 * #570 real Windows Codex App Server -> actual local MCP grant -> Desktop tool
 * registration -> simulated panel bridge. Operator opt-in only.
 * No model inference, production user data, Windows MemoFlow installation
 * or actual Vue/Goal owner writes. Those require separate acceptance.
 */
describe('Windows native Codex -> actual MemoFlow panel MCP grant (#570)', () => {
  it.skipIf(process.env.MEMOFLOW_RUN_WINDOWS_CODEX_MCP_QA !== 'CONFIRM_NO_TURN')(
    'discovers eight Goal panel tools, invokes snapshot/open and respects revocation',
    async () => {
      const windowsNode = process.env.MEMOFLOW_QA_WINDOWS_NODE_EXE;
      const windowsCodex = process.env.MEMOFLOW_QA_WINDOWS_CODEX_EXE_WIN;
      const windowsTempMount = process.env.MEMOFLOW_QA_WINDOWS_TEMP_MOUNT;
      expect(windowsNode, 'Explicit WSL path to Windows node.exe is required').toBeTruthy();
      expect(windowsCodex, 'Explicit native Windows Codex executable is required').toBeTruthy();
      expect(windowsTempMount, 'Explicit WSL mount of Windows Temp is required').toBeTruthy();
      expect(windowsTempMount).toMatch(/^\/mnt\/[a-z]\/.+/);
      await fs.access(windowsNode!);
      await fs.access(windowsTempMount!);

      const fixture = createPowerSyncSqliteFixture();
      const store = new LocalAgentRepository(fixture.db);
      const calls: string[] = [];
      let opened = false;
      const panelBridge: IDesktopNativePanelBridge = {
        executeCommand: vi.fn(async (_context, command): Promise<NativePanelIpcResponse> => {
          calls.push(command.action);
          if (command.action === 'open') opened = true;
          return {
            requestId: randomUUID(),
            ok: true,
            snapshot: {
              panelSurface: 'business',
              activeModule: 'goal',
              activeTabRoute: '/goals',
              formOpen: opened,
              mode: opened ? 'create' : null,
              goalId: null,
              revision: 1,
              dirty: false,
              busy: false,
              error: null,
              isControlled: opened,
              controlledByMe: opened,
              allowedActions: opened ? ['patch', 'submit', 'release'] : ['open'],
            },
          };
        }),
        releaseAllForRun: vi.fn(),
      };
      const bridge = createDesktopLocalAgentTools(
        fixture.db,
        store,
        () => true,
        { getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }) },
        undefined,
        panelBridge,
      );
      let dir: string | null = null;

      try {
        const identityId = 'IdentityId_00000000-0000-4000-8000-000000000057';
        const connection = await store.createConnection(identityId, {
          driver: 'codex',
          name: 'Temporary Windows MCP QA',
          executablePath: 'codex',
          enabled: true,
          writeScopes: ['goals:write'],
        });
        const grant = await bridge.open({
          permissionMode: 'auto-approve',
          identityId,
          connectionId: connection.id,
          conversationId: 'operator-qa-570',
          runId: 'windows-native-570',
        });
        dir = await mkdtemp(path.join(windowsTempMount!, 'memoflow-570-mcp-'));
        const source = path.resolve(
          import.meta.dirname,
          '../../../../test-support/windows-codex-mcp-operator.cjs',
        );
        const destination = path.join(dir, 'win-codex-mcp-operator.cjs');
        await copyFile(source, destination);
        const winPath = execFileSync('wslpath', ['-w', destination], {
          encoding: 'utf8',
          timeout: 5000,
        }).trim();
        const { stdout } = await execFileAsync(windowsNode!, [winPath], {
          timeout: 55_000,
          maxBuffer: 10_000,
          windowsHide: true,
          env: {
            ...process.env,
            // WSL does not forward arbitrary vars to Windows executables unless
            // explicitly exported via WSLENV. The grant is temporary and never logged.
            WSLENV: [process.env.WSLENV, 'MF570_CODEX_WIN_EXE', 'MF570_MCP_URL', 'MF570_MCP_TOKEN']
              .filter(Boolean)
              .join(':'),
            MF570_CODEX_WIN_EXE: windowsCodex!,
            MF570_MCP_URL: grant.url,
            MF570_MCP_TOKEN: grant.token,
          },
        });
        expect(stdout).toContain('NATIVE_CODEX_INITIALIZE=PASS');
        expect(stdout).toContain('EPHEMERAL_THREAD=PASS');
        expect(stdout).toContain('MCP_SERVER_CONNECTED=true');
        expect(stdout).toContain('DISCOVERED_GOAL_PANEL_TOOLS=8');
        expect(stdout).toContain('CODEX_GOAL_SNAPSHOT_CALL=true');
        expect(stdout).toContain('CODEX_GOAL_OPEN_CALL=true');
        expect(stdout).toContain('NATIVE_MODEL_TURNS=0');
        expect(stdout).toContain('WIN_REAL_CODEX_MEMOFLOW_MCP=PASS');
        expect(stdout).toContain('EPHEMERAL_CODEX_HOME_REMOVED=true');
        expect(calls).toEqual(['snapshot', 'open']);

        grant.revoke();
        const denied = await fetch(grant.url, {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + grant.token,
            accept: 'application/json, text/event-stream',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'after-revoke',
            method: 'tools/call',
            params: { name: 'goal_panel_snapshot', arguments: {} },
          }),
        });
        expect(denied.status).toBe(401);
        expect(panelBridge.releaseAllForRun).toHaveBeenCalledWith(
          'operator-qa-570',
          'windows-native-570',
        );
      } finally {
        await bridge.dispose();
        fixture.close();
        if (dir) await rm(dir, { recursive: true, force: true });
      }
    },
    65_000,
  );
});

/**
 * Nightly regression: Windows released the ephemeral CODEX_HOME handles after
 * the old 6 x 350ms cleanup budget, so `EPHEMERAL_CODEX_HOME_REMOVED` was
 * false while the product path itself passed. Cleanup must kill the whole
 * process tree, retry until `existsSync` proves the path is gone, and report
 * the surviving paths instead of a bare boolean.
 */
describe('ephemeral Windows Codex home cleanup', () => {
  it('removes the ephemeral home and only reports true once the path is gone', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mf570-cleanup-'));
    await mkdir(path.join(root, 'empty-codex-home', 'log'), {
      recursive: true,
    });
    await writeFile(path.join(root, 'empty-codex-home', 'log', 'codex-tui.log'), 'x'.repeat(64));

    const result = await operator.removeEphemeralHome(root);

    expect(result.removed).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.residual).toEqual([]);
    expect(existsSync(root)).toBe(false);
  });

  it('keeps retrying a transient lock past the old six-attempt budget', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mf570-cleanup-lock-'));
    await writeFile(path.join(root, 'codex-tui.log'), 'held by another handle');
    const lockFailures = 9;
    let failures = 0;
    const delays: number[] = [];
    const lockedFs: OperatorFs = {
      existsSync: (target) => existsSync(target),
      readdirSync: (target, options) => readdirSync(target, options as { withFileTypes: true }),
      statSync: (target) => statSync(target),
      rmSync: (target, options) => {
        if (failures < lockFailures) {
          failures += 1;
          const error = new Error('EBUSY: resource busy or locked') as Error & {
            code: string;
          };
          error.code = 'EBUSY';
          throw error;
        }
        rmSync(target, options as { recursive: true; force: true });
      },
    };

    try {
      const result = await operator.removeEphemeralHome(root, {
        fsImpl: lockedFs,
        sleepImpl: async (ms) => {
          delays.push(ms);
        },
      });

      expect(result.removed).toBe(true);
      // Nine EBUSY attempts would have exhausted the old six-attempt loop.
      expect(result.attempts).toBe(lockFailures + 1);
      expect(result.attempts).toBeGreaterThan(6);
      expect(result.residual).toEqual([]);
      expect(existsSync(root)).toBe(false);
      // Backoff grows well past the old fixed 350ms pause.
      expect(delays[delays.length - 1]).toBe(2_000);
      expect(delays[delays.length - 1]).toBeGreaterThan(350);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports false and lists residual paths when rmSync leaves the directory behind', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mf570-cleanup-residual-'));
    await writeFile(path.join(root, 'stuck.log'), 'still-here');
    const stubbornFs: OperatorFs = {
      // rmSync "succeeds" but the path never disappears, which is exactly why a
      // non-throwing rmSync must not be treated as proof of removal.
      existsSync: () => true,
      readdirSync: (target, options) => readdirSync(target, options as { withFileTypes: true }),
      statSync: (target) => statSync(target),
      rmSync: () => {},
    };

    try {
      const result = await operator.removeEphemeralHome(root, {
        fsImpl: stubbornFs,
        sleepImpl: async () => {},
        maxAttempts: 3,
      });

      expect(result.removed).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.residual).toContain('stuck.log (10 bytes)');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('terminates the whole process tree on Windows instead of only the direct child', () => {
    const invocations: Array<{ command: string; args: string[] }> = [];
    const killed = operator.killProcessTree(4321, {
      platform: 'win32',
      spawnSyncImpl: (command, args) => {
        invocations.push({ command, args });
        return { status: 0 };
      },
    });

    expect(killed).toBe(true);
    expect(invocations).toEqual([{ command: 'taskkill', args: ['/PID', '4321', '/T', '/F'] }]);
  });

  it('waits for a slow-exiting child before deleting its working directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mf570-cleanup-slow-'));
    const child = spawn(
      process.execPath,
      [
        '-e',
        'process.on("SIGTERM", () => setTimeout(() => process.exit(0), 500)); setInterval(() => {}, 1000);',
      ],
      { cwd: root, stdio: 'ignore', windowsHide: true },
    );

    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const startedAt = Date.now();
      child.kill('SIGTERM');
      expect(await operator.waitForChildExit(child, 5_000)).toBe(true);
      // SIGTERM is not catchable on Windows, so only assert the delay on POSIX.
      if (process.platform !== 'win32') {
        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(400);
      }

      const result = await operator.removeEphemeralHome(root);

      expect(result.removed).toBe(true);
      expect(existsSync(root)).toBe(false);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await rm(root, { recursive: true, force: true });
    }
  });
});
