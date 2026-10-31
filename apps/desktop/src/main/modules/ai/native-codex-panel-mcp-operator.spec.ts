import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs, { mkdtemp, copyFile, rm } from 'node:fs/promises';
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
