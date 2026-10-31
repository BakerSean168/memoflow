import { describe, expect, it, vi } from 'vitest';
import { createPowerSyncSqliteFixture } from '@memoflow/test-utils/helpers/powersync-sqlite';
import { LocalAgentRepository } from '@memoflow/ai';
import { createTimeContext } from '@memoflow/time';
import { createDesktopLocalAgentTools } from './local-agent-tools';
import type { IDesktopNativePanelBridge } from './desktop-native-panel-bridge';
import type { NativePanelIpcResponse } from '@memoflow/ai-contracts';

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
        permissionMode: 'auto-approve',
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

  it('routes Goal creation to the visible form unless the user explicitly asked for a background write', async () => {
    const f = createPowerSyncSqliteFixture();
    const store = new LocalAgentRepository(f.db);
    const mockBridge: IDesktopNativePanelBridge = {
      executeCommand: vi.fn(),
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
    const identityId = 'IdentityId_00000000-0000-4000-8000-000000000002';
    async function createGoal(goalIntent: string, idempotencyKey: string) {
      const connection = await store.createConnection(identityId, {
        driver: 'codex' as const,
        name: `Route ${idempotencyKey}`,
        executablePath: 'codex',
        enabled: true,
        writeScopes: ['goals:write'],
      });
      const grant = await bridge.open({
        permissionMode: 'auto-approve',
        identityId,
        connectionId: connection.id,
        conversationId: 'conv-route',
        runId: `run-${idempotencyKey}`,
        goalIntent,
      });
      const response = await fetch(grant.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${grant.token}`,
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'goal_create',
            arguments: { idempotencyKey, goal: { name: '三个月读完 6 本书' } },
          },
        }),
      });
      return response.text();
    }
    const goalCount = () => f.sql.prepare('SELECT COUNT(*) AS n FROM goals').get();

    try {
      // The screenshot request: a plain "help me create a goal" must not become a hidden write.
      expect(await createGoal('帮我创建一个目标：三个月内读完 6 本书', 'plain')).toContain(
        'GOAL_PANEL_REQUIRED',
      );
      expect(await createGoal('直接帮我创建这个目标', 'just-do-it')).toContain(
        'GOAL_PANEL_REQUIRED',
      );
      expect(goalCount()).toMatchObject({ n: 0 });
      expect(mockBridge.executeCommand).not.toHaveBeenCalled();

      const direct = await createGoal('不用打开表单，后台直接创建：三个月读完 6 本书', 'direct');
      expect(direct).toContain('receiptId');
      expect(goalCount()).toMatchObject({ n: 1 });
    } finally {
      await bridge.dispose();
      f.close();
    }
  });
});

it.each(['approve', 'decline', 'abort', 'auto-approve'] as const)(
  'gates Codex panel persistence with the session decision: %s',
  async (decision) => {
    const f = createPowerSyncSqliteFixture();
    const store = new LocalAgentRepository(f.db);
    const executeCommand = vi.fn<IDesktopNativePanelBridge['executeCommand']>(async () => ({
      requestId: 'panel',
      ok: true,
    }));
    const bridge = createDesktopLocalAgentTools(
      f.db,
      store,
      () => true,
      { getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }) },
      undefined,
      { executeCommand, releaseAllForRun: vi.fn() },
    );
    let answer!: (approved: boolean) => void;
    let entered!: () => void;
    const requested = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const requestApproval = vi.fn((_name: string, signal: AbortSignal) => {
      entered();
      return new Promise<boolean>((resolve) => {
        answer = resolve;
        signal.addEventListener('abort', () => resolve(false), { once: true });
      });
    });
    try {
      const connection = await store.createConnection('owner', {
        driver: 'codex',
        name: 'Codex',
        executablePath: 'codex',
        enabled: true,
        writeScopes: ['goals:write'],
      });
      const grant = await bridge.open({
        identityId: 'owner',
        connectionId: connection.id,
        conversationId: 'chat',
        runId: 'run',
        goalIntent: 'Create a goal to learn French',
        permissionMode: decision === 'auto-approve' ? 'auto-approve' : 'supervised',
        requestApproval,
      });
      const call = (name: string) =>
        fetch(grant.url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${grant.token}`,
            accept: 'application/json, text/event-stream',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name, arguments: {} },
          }),
        })
          .then((res) => res.text())
          .catch(() => 'transport closed');
      await call('goal_panel_open');
      expect(requestApproval).not.toHaveBeenCalled();
      executeCommand.mockClear();
      const saving = call('goal_panel_submit');
      if (decision !== 'auto-approve') {
        await requested;
        expect(requestApproval).toHaveBeenCalledWith('goal_panel_submit', expect.any(AbortSignal));
        expect(executeCommand).not.toHaveBeenCalled();
        if (decision === 'abort') grant.revoke();
        else answer(decision === 'approve');
      }
      const result = await saving;
      if (decision === 'approve' || decision === 'auto-approve') {
        expect(result).not.toContain('PERMISSION_DENIED');
        expect(executeCommand).toHaveBeenCalledOnce();
        expect(executeCommand.mock.calls[0]?.[1]).toMatchObject({ action: 'submit' });
      } else {
        expect(executeCommand).not.toHaveBeenCalled();
        if (decision === 'decline') expect(result).toContain('PERMISSION_DENIED');
      }
      if (decision === 'auto-approve') expect(requestApproval).not.toHaveBeenCalled();
    } finally {
      await bridge.dispose();
      f.close();
    }
  },
);
