import { describe, expect, it, vi } from 'vitest';
import { createPowerSyncSqliteFixture } from '@memoflow/test-utils/helpers/powersync-sqlite';
import { LocalAgentRepository } from '@memoflow/ai';
import { createTimeContext } from '@memoflow/time';
import { createDesktopLocalAgentTools } from './local-agent-tools';
import type { IDesktopNativePanelBridge } from './desktop-native-panel-bridge';
import type { NativePanelIpcResponse } from '@memoflow/contracts/ai';

describe('Desktop Local Agent Goal Panel Tools', () => {
  it('registers panel tools, dispatches commands to bridge and triggers release on revoke', async () => {
    const f = createPowerSyncSqliteFixture();
    const store = new LocalAgentRepository(f.db);
    const mockBridge: IDesktopNativePanelBridge = {
      executeCommand: vi.fn(async (_context, command) => {
        const response: NativePanelIpcResponse = {
          requestId: 'req-1',
          ok: true,
          snapshot: {
            panelSurface: 'business',
            activeModule: 'goal',
            activeTabRoute: '/goals',
            formOpen: command.action === 'open',
            mode: 'create',
            goalId: null,
            revision: 1,
            dirty: false,
            busy: false,
            error: null,
            isControlled: true,
            controlledByMe: true,
            allowedActions: ['patch', 'submit', 'release'],
          },
        };
        return response;
      }),
      releaseAllForRun: vi.fn(),
    };

    const bridge = createDesktopLocalAgentTools(
      f.db,
      store,
      () => true,
      {
        getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      },
      undefined,
      mockBridge,
    );

    const identityId = 'IdentityId_00000000-0000-4000-8000-000000000001';
    const config = {
      driver: 'codex' as const,
      name: 'Panel Test',
      executablePath: 'codex',
      enabled: true,
      writeScopes: ['goals:write'],
    };

    async function callMcp(
      grant: { url: string; token: string },
      method: string,
      params: unknown = {},
    ) {
      return fetch(grant.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${grant.token}`,
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
    }

    try {
      const connection = await store.createConnection(identityId, config);
      const grant = await bridge.open({
        identityId,
        connectionId: connection.id,
        conversationId: 'conv-test',
        runId: 'run-test',
      });

      // 1. Tool discovery
      const listRes = await callMcp(grant, 'tools/list');
      const listText = await listRes.text();
      expect(listText).toContain('goal_panel_snapshot');
      expect(listText).toContain('goal_panel_open');
      expect(listText).toContain('goal_panel_patch');
      expect(listText).toContain('goal_panel_add_key_result');
      expect(listText).toContain('goal_panel_remove_key_result');
      expect(listText).toContain('goal_panel_focus');
      expect(listText).toContain('goal_panel_submit');
      expect(listText).toContain('goal_panel_release');

      // 2. Tool invocation
      const openRes = await callMcp(grant, 'tools/call', {
        name: 'goal_panel_open',
        arguments: { mode: 'create' },
      });
      const openText = await openRes.text();
      expect(openRes.status).toBe(200);
      expect(openText).toContain('"isControlled":true');
      expect(mockBridge.executeCommand).toHaveBeenCalledTimes(1);

      const first = vi.mocked(mockBridge.executeCommand).mock.calls[0]![0];
      const snapshotRes = await callMcp(grant, 'tools/call', {
        name: 'goal_panel_snapshot',
        arguments: {},
      });
      await snapshotRes.text();
      expect(snapshotRes.status).toBe(200);
      const second = vi.mocked(mockBridge.executeCommand).mock.calls[1]![0];
      expect(first.signal).not.toBe(second.signal);
      expect(first.grantSignal).toBeDefined();
      expect(first.grantSignal).toBe(second.grantSignal);
      expect(first.grantSignal.aborted).toBe(false);

      // 3. Revoke triggers release and invalidates every request's shared grant.
      grant.revoke();
      expect(first.grantSignal.aborted).toBe(true);
      const denied = await callMcp(grant, 'tools/call', {
        name: 'goal_panel_snapshot',
        arguments: {},
      });
      await denied.text();
      expect(denied.status).toBe(401);
      expect(mockBridge.executeCommand).toHaveBeenCalledTimes(2);
      expect(mockBridge.releaseAllForRun).toHaveBeenCalledWith('conv-test', 'run-test');
    } finally {
      await bridge.dispose();
      f.close();
    }
  });
});
