import { expect, it, vi } from 'vitest';
import type { IDesktopNativePanelBridge } from './desktop-native-panel-bridge';
import type { GoalPanelSnapshot } from '@memoflow/ai-contracts';
import { createPowerSyncSqliteFixture } from '@memoflow/test-utils/helpers/powersync-sqlite';
import {
  LocalAgentRepository,
  LocalMcpClientRepository,
  PermissionLocalRepository,
} from '@memoflow/ai';
import { createTimeContext } from '@memoflow/time';
import { createDesktopLocalAgentTools } from './local-agent-tools';

const owner = 'IdentityId_00000000-0000-4000-8000-000000000001';
const foreign = 'IdentityId_00000000-0000-4000-8000-000000000002';
const task = {
  name: 'Prepare next step',
  importance: 'Moderate',
  schedule: { kind: 'OneTime', date: '2026-12-01', timing: { kind: 'AllDay' } },
};
function plan() {
  return {
    idempotencyKey: 'complete-plan',
    plan: {
      target: { mode: 'create', goal: { name: 'Release fixture' } },
      keyResults: [
        { ref: 'kr:release', keyResult: { title: 'Published version', targetValue: 1 } },
        { ref: 'kr:verified', keyResult: { title: 'Verified core flows', targetValue: 3 } },
      ],
      tasks: [
        { ref: 'task:release', keyResultRef: 'kr:release', plan: task },
        {
          ref: 'task:verify',
          keyResultRef: 'kr:verified',
          plan: { ...task, name: 'Verify core flows' },
        },
      ],
    },
  };
}
async function fixture(panels?: IDesktopNativePanelBridge) {
  const f = createPowerSyncSqliteFixture();
  const permissions = new PermissionLocalRepository(f.db);
  const bridge = createDesktopLocalAgentTools(
    f.db,
    new LocalAgentRepository(f.db),
    () => true,
    { getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }) },
    undefined,
    panels,
    { clients: new LocalMcpClientRepository(f.db) },
  );
  const credential = await bridge.createMcpClient(owner, {
    name: 'External fixture',
    writeScopes: ['goals:write', 'tasks:write'],
  });
  async function call(
    name: string,
    args: unknown,
    token = credential.token,
    method = 'tools/call',
  ) {
    const response = await fetch(credential.endpoint.url, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + token,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': method,
        ...(method === 'tools/call' ? { 'Mcp-Name': name } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params: {
          ...(method === 'tools/call' ? { name, arguments: args } : {}),
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': { name: 'fixture', version: '1' },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    });
    const body = await response.text();
    return { status: response.status, body: response.status === 200 ? JSON.parse(body) : body };
  }
  async function close() {
    await bridge.dispose();
    f.close();
  }
  return { ...f, bridge, credential, permissions, call, close };
}
it('creates and replays a complete plan through real local owners without an Agent conversation', async () => {
  const f = await fixture();
  try {
    expect((await f.call('workflow_guide_get', {})).body.result.content[0].text).toContain(
      'measurable Key Results',
    );
    const input = plan();
    const first = (await f.call('goal_plan_apply', input)).body.result;
    expect(first, JSON.stringify(first)).not.toHaveProperty('isError', true);
    const result = first.structuredContent;
    expect(result.status).toBe('success');
    const replay = (await f.call('goal_plan_apply', input)).body.result.structuredContent;
    expect(replay).toEqual(result);
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM goals').get()).toMatchObject({ n: 1 });
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM key_results').get()).toMatchObject({ n: 2 });
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM task_plans').get()).toMatchObject({ n: 2 });
    for (const [taskRef, krRef] of [
      ['task:release', 'kr:release'],
      ['task:verify', 'kr:verified'],
    ]) {
      expect(
        f.sql
          .prepare('SELECT goal_id, key_result_id FROM task_plans WHERE id = ?')
          .get(result.referenceMap[taskRef!]),
      ).toMatchObject({
        goal_id: result.referenceMap.goal,
        key_result_id: result.referenceMap[krRef!],
      });
    }
    const enriched = (
      await f.call('goal_plan_apply', {
        idempotencyKey: 'enrich',
        plan: {
          target: {
            mode: 'existing',
            goalId: result.referenceMap.goal,
            expectedVersion: result.goalVersion,
          },
          keyResults: [
            { ref: 'kr:adoption', keyResult: { title: 'First active user', targetValue: 1 } },
          ],
          existingKeyResults: [
            { ref: 'kr:released', keyResultId: result.referenceMap['kr:release'] },
          ],
          tasks: [
            {
              ref: 'task:followup',
              keyResultRef: 'kr:released',
              plan: { ...task, name: 'Follow up' },
            },
          ],
        },
      })
    ).body.result.structuredContent;
    expect(enriched.status).toBe('success');
    expect(enriched.referenceMap.goal).toBe(result.referenceMap.goal);
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM goals').get()).toMatchObject({ n: 1 });
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM key_results').get()).toMatchObject({ n: 3 });
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM task_plans').get()).toMatchObject({ n: 3 });
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM ai_local_conversations').get()).toMatchObject({
      n: 0,
    });
    const audit = await f.bridge.listGatewayAudit(owner);
    expect(audit).toContainEqual(
      expect.objectContaining({ tool: 'goal_plan_apply', effect: 'write' }),
    );
    expect(JSON.stringify(audit)).not.toContain('Release fixture');
    await f.bridge.revokeMcpClient(owner, f.credential.client.id);
    expect((await f.call('goal_plan_apply', input)).status).toBe(401);
  } finally {
    await f.close();
  }
});
it('honors Task and KR deny rules, then replays only owner receipts after permission recovery', async () => {
  const f = await fixture();
  try {
    await f.permissions.saveRule(owner, {
      id: 'deny-kr',
      agentId: null,
      object: 'key_result',
      action: 'create',
      effect: 'deny',
      source: 'user',
    });
    const denied = (await f.call('goal_plan_apply', plan())).body.result;
    expect(denied.structuredContent).toMatchObject({
      status: 'failed',
      failures: [{ code: 'PERMISSION_DENIED' }],
    });
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM goals').get()).toMatchObject({ n: 0 });
    await f.permissions.removeRule(owner, 'deny-kr');
    await f.permissions.saveRule(owner, {
      id: 'deny-task',
      agentId: null,
      object: 'task',
      action: 'create',
      effect: 'deny',
      source: 'user',
    });
    const partial = (await f.call('goal_plan_apply', plan())).body.result.structuredContent;
    expect(partial).toMatchObject({ status: 'partial', failures: [{ code: 'PERMISSION_DENIED' }] });
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM task_plans').get()).toMatchObject({ n: 0 });
    const audit = await f.bridge.listGatewayAudit(owner);
    expect(audit).toContainEqual(
      expect.objectContaining({
        tool: 'goal_plan_apply',
        effect: 'write',
        outcome: 'PERMISSION_DENIED',
        scopeDecision: 'denied',
      }),
    );
    await f.permissions.removeRule(owner, 'deny-task');
    const completed = (await f.call('goal_plan_apply', plan())).body.result.structuredContent;
    expect(completed.status).toBe('success');
    expect(completed.referenceMap.goal).toBe(partial.referenceMap.goal);
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM goals').get()).toMatchObject({ n: 1 });
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM task_plans').get()).toMatchObject({ n: 2 });
    const changed = plan();
    changed.plan.tasks[0]!.plan.name = 'Changed committed task';
    expect((await f.call('goal_plan_apply', changed)).body.result.structuredContent).toMatchObject({
      status: 'partial',
      failures: [{ code: 'CONFLICT', retryable: false }],
    });
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM task_plans').get()).toMatchObject({ n: 2 });
  } finally {
    await f.close();
  }
});
it('rejects missing and foreign existing Goals even when Tasks do not bind a KR', async () => {
  const f = await fixture();
  try {
    const other = await f.bridge.createMcpClient(foreign, {
      name: 'Other fixture',
      writeScopes: ['goals:write'],
    });
    const created = (
      await f.call(
        'goal_create',
        { idempotencyKey: 'foreign', goal: { name: 'Foreign fixture' } },
        other.token,
      )
    ).body.result.structuredContent;
    for (const goalId of [created.result.goalId, 'GoalId_00000000-0000-4000-8000-000000000099']) {
      const result = (
        await f.call('goal_plan_apply', {
          idempotencyKey: 'missing-' + goalId,
          plan: {
            target: { mode: 'existing', goalId, expectedVersion: 1 },
            tasks: [{ ref: 'task:unbound', plan: task }],
          },
        })
      ).body.result.structuredContent;
      expect(result).toMatchObject({ status: 'failed', failures: [{ code: 'NOT_FOUND' }] });
    }
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM task_plans').get()).toMatchObject({ n: 0 });
  } finally {
    await f.close();
  }
});

function panelResponse(revision: number, controlledByMe = true) {
  return {
    requestId: 'panel-response',
    ok: true,
    snapshot: {
      panelSurface: 'business',
      activeModule: 'goal',
      activeTabRoute: '/goals',
      formOpen: true,
      mode: 'create',
      goalId: null,
      revision,
      dirty: revision > 1,
      busy: false,
      error: null,
      isControlled: controlledByMe,
      controlledByMe,
      allowedActions: [],
    } satisfies GoalPanelSnapshot,
  };
}
it('presents a Goal/KR draft through external MCP and hands it to the user without persisting business data', async () => {
  const panels = {
    executeCommand: vi
      .fn()
      .mockResolvedValueOnce(panelResponse(1))
      .mockResolvedValueOnce(panelResponse(2))
      .mockResolvedValueOnce(panelResponse(3))
      .mockResolvedValueOnce(panelResponse(3, false)),
    releaseForContext: vi.fn(async () => {}),
  };
  const f = await fixture(panels);
  try {
    const response = (
      await f.call('goal_panel_present', {
        mode: 'create',
        fields: { name: 'Release draft', summary: 'Ready to refine' },
        keyResults: [{ title: 'Published release', targetValue: 1 }],
      })
    ).body.result;
    expect(response).not.toHaveProperty('isError', true);
    expect(response.structuredContent).toMatchObject({
      mode: 'create',
      savedByTool: false,
      handedOff: true,
      snapshot: { controlledByMe: false },
    });
    const commands = panels.executeCommand.mock.calls.map(([, command]) => command);
    expect(commands).toEqual([
      { action: 'open', mode: 'create' },
      { action: 'patch', name: 'Release draft', summary: 'Ready to refine', expectedRevision: 1 },
      expect.objectContaining({ action: 'add_key_result', expectedRevision: 2 }),
      { action: 'release' },
    ]);
    expect(panels.executeCommand.mock.calls[0]![0]).toMatchObject({
      origin: 'client',
      conversationId: '',
      runId: '',
    });
    expect(panels.releaseForContext).toHaveBeenCalledTimes(1);
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM goals').get()).toMatchObject({ n: 0 });
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM task_plans').get()).toMatchObject({ n: 0 });
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM ai_local_conversations').get()).toMatchObject({
      n: 0,
    });
    const listed = (await f.call('', {}, f.credential.token, 'tools/list')).body.result.tools.map(
      (tool: { name: string }) => tool.name,
    );
    expect(listed).toContain('goal_panel_present');
    expect(listed).not.toContain('goal_panel_submit');
    const submit = await f.call('goal_panel_submit', {});
    expect(submit.body).toMatchObject({ error: { code: -32602 } });
  } finally {
    await f.close();
  }
});
it.each([
  ['BUSINESS_SURFACE_CONFLICT', 0],
  ['REVISION_CONFLICT', 1],
] as const)(
  'stops presentation on %s and releases the temporary editor',
  async (code, successfulCommands) => {
    const executeCommand = vi.fn();
    if (successfulCommands) executeCommand.mockResolvedValueOnce(panelResponse(1));
    executeCommand.mockResolvedValueOnce({
      requestId: 'failed',
      ok: false,
      error: { code, message: 'Controlled failure' },
    });
    const panels = { executeCommand, releaseForContext: vi.fn(async () => {}) };
    const f = await fixture(panels);
    try {
      const response = (
        await f.call('goal_panel_present', {
          mode: 'create',
          fields: { name: 'Do not overwrite' },
          keyResults: [{ title: 'KR', targetValue: 1 }],
        })
      ).body.result;
      expect(response).toMatchObject({ isError: true, content: [{ text: code }] });
      expect(executeCommand).toHaveBeenCalledTimes(successfulCommands + 1);
      expect(panels.releaseForContext).toHaveBeenCalledTimes(1);
    } finally {
      await f.close();
    }
  },
);
it('releases a presentation when its external credential is revoked between panel commands', async () => {
  const panels = {
    executeCommand: vi.fn().mockResolvedValueOnce(panelResponse(1)),
    releaseForContext: vi.fn(async () => {}),
  };
  const f = await fixture(panels);
  try {
    panels.executeCommand.mockImplementationOnce(async () => {
      await f.bridge.revokeMcpClient(owner, f.credential.client.id);
      return panelResponse(2);
    });
    const response = (
      await f.call('goal_panel_present', {
        mode: 'create',
        fields: { name: 'Interrupted draft' },
      })
    ).body.result;
    expect(response.isError).toBe(true);
    expect(panels.executeCommand).toHaveBeenCalledTimes(2);
    expect(panels.releaseForContext).toHaveBeenCalledTimes(1);
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM goals').get()).toMatchObject({ n: 0 });
  } finally {
    await f.close();
  }
});
