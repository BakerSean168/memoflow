import { afterEach, expect, it, vi } from 'vitest';
import { RequestContext, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import { createLocalAgentSqlite } from '../../../testing/local-agent-sqlite';
import { PermissionLocalRepository } from '../../permissions';
import { createMemoFlowProductTools } from './product-tools';
import { applyMemoFlowSessionToolPolicy, checkMemoFlowToolPermission } from './product-tool-policy';

const databases: ReturnType<typeof createLocalAgentSqlite>[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
function fixture() {
  const db = createLocalAgentSqlite();
  databases.push(db);
  const permissions = new PermissionLocalRepository(db);
  const context = new RequestContext();
  context.setRaw('identityId', 'owner');
  context.setRaw('agentInstanceId', 'assistant-1');
  context.setRaw(MASTRA_THREAD_ID_KEY, 'chat');
  context.setRaw('executionContext', {
    identityId: 'owner',
    requestId: 'r',
    traceId: 't',
    startedAt: 1,
    source: 'ipc',
  });
  const createRoutine = vi.fn(async () => ({ routineId: 'created' }));
  const setProfileActive = vi.fn(async () => ({ profileId: 'p', active: true }));
  const tools = createMemoFlowProductTools({
    permissions,
    routineCommandPort: { createRoutine, setProfileActive } as never,
  });
  const session = {
    state: { set: vi.fn(async () => {}) },
    resolveToolApproval: (_name: string): 'allow' | 'ask' | 'deny' => 'allow',
  };
  return { permissions, context, createRoutine, setProfileActive, tools, session };
}

it.each([
  ['read_only', 'deny', 'deny'],
  ['confirm_each', 'ask', 'ask'],
  ['on_demand', 'ask', 'ask'],
  ['full_auto', 'allow', 'allow'],
] as const)('uses %s for native creation/update decisions', async (preset, create, update) => {
  const f = fixture();
  await f.permissions.saveSettings('owner', {
    preset,
    agentPresets: {},
    revision: 1,
  });
  await applyMemoFlowSessionToolPolicy(f.session, 'approval-required', f.context);
  for (const [name, expected] of [
    ['routine_create', create],
    ['routine_set_profile_active', update],
  ] as const) {
    const tool = f.tools[name];
    const approval = await tool.needsApprovalFn!(
      {},
      { requestContext: Object.fromEntries(f.context.entries()) },
    );
    expect(approval).toBe(expected !== 'allow');
    expect(f.session.resolveToolApproval(name)).toBe(expected);
  }
  expect((await f.permissions.listAudit('owner')).map((record) => record.decision).sort()).toEqual(
    [create, update].sort(),
  );
  expect(await f.permissions.listAudit('other')).toEqual([]);
});

it('executes authorized creation, records execution, and rechecks a deny added while approval is parked', async () => {
  const f = fixture();
  await f.permissions.saveRule('owner', {
    id: 'routine-create-allowed',
    agentId: null,
    object: 'routine',
    action: 'create',
    effect: 'allow',
    source: 'user',
  });
  await applyMemoFlowSessionToolPolicy(f.session, 'approval-required', f.context);
  expect(await checkMemoFlowToolPermission(f.permissions, 'routine_create', f.context)).toBe(
    'allow',
  );
  await f.tools.routine_create.execute!(
    {
      name: 'Review',
      trigger: { type: 'Elapsed', timingOwner: 'local-runtime', durationMs: 60000 },
    },
    { requestContext: f.context, observe: {} as never },
  );
  expect(f.createRoutine).toHaveBeenCalledOnce();
  expect(await f.permissions.listAudit('owner')).toContainEqual(
    expect.objectContaining({
      operationId: 'routine.create',
      execution: 'succeeded',
      agentId: 'assistant-1',
      conversationId: 'chat',
    }),
  );
  expect(
    await checkMemoFlowToolPermission(f.permissions, 'routine_set_profile_active', f.context),
  ).toBe('ask');
  await f.permissions.saveRule('owner', {
    id: 'deny',
    agentId: 'assistant-1',
    object: 'routine',
    action: 'update',
    effect: 'deny',
    source: 'user',
  });
  await expect(
    f.tools.routine_set_profile_active.execute!(
      { profileId: 'p', active: true },
      { requestContext: f.context, observe: {} as never },
    ),
  ).rejects.toThrow('not authorized');
  expect(f.setProfileActive).not.toHaveBeenCalled();
});

it('keeps explicit denies in full auto and fails closed on unknown tools and storage failures', async () => {
  const f = fixture();
  f.context.setRaw('permissionMode', 'full-access');
  await f.permissions.saveRule('owner', {
    id: 'deny',
    agentId: null,
    object: 'routine',
    action: 'create',
    effect: 'deny',
    source: 'user',
  });
  await applyMemoFlowSessionToolPolicy(f.session, 'full-access', f.context);
  expect(await checkMemoFlowToolPermission(f.permissions, 'routine_create', f.context)).toBe(
    'deny',
  );
  expect(f.session.resolveToolApproval('routine_create')).toBe('deny');
  expect(await checkMemoFlowToolPermission(f.permissions, 'ai_permission.update', f.context)).toBe(
    'deny',
  );
  expect(await checkMemoFlowToolPermission(f.permissions, 'unregistered', f.context)).toBe('deny');
  vi.spyOn(f.permissions, 'getSettings').mockRejectedValue(new Error('offline'));
  await expect(
    checkMemoFlowToolPermission(f.permissions, 'routine_create', f.context),
  ).rejects.toThrow('offline');
  expect(f.session.resolveToolApproval('routine_create')).toBe('deny');
});

it('checks every owner exposed by workspace context instead of bypassing a task read deny', async () => {
  const f = fixture();
  await f.permissions.saveRule('owner', {
    id: 'task-read-deny',
    agentId: null,
    object: 'task',
    action: 'read',
    effect: 'deny',
    source: 'user',
  });
  await applyMemoFlowSessionToolPolicy(f.session, 'approval-required', f.context);
  expect(await checkMemoFlowToolPermission(f.permissions, 'workspace_overview', f.context)).toBe(
    'deny',
  );
  expect(f.session.resolveToolApproval('workspace_overview')).toBe('deny');
  const records = await f.permissions.listAudit('owner');
  expect(records.map((record) => record.operationId).sort()).toEqual([
    'goal.read',
    'notification.read',
    'task.read',
  ]);
});

it('honors a custom ask for a read tool through the native approval policy', async () => {
  const f = fixture();
  await f.permissions.saveRule('owner', {
    id: 'ask-read',
    agentId: 'assistant-1',
    object: 'knowledge',
    action: 'read',
    effect: 'ask',
    source: 'user',
  });
  await applyMemoFlowSessionToolPolicy(f.session, 'approval-required', f.context);
  expect(
    await f.tools.knowledge_search.needsApprovalFn!(
      { query: 'notes' },
      { requestContext: Object.fromEntries(f.context.entries()) },
    ),
  ).toBe(true);
  expect(f.session.resolveToolApproval('knowledge_search')).toBe('ask');
});

it.each(['approval-required', 'auto-accept-edits', 'auto', 'full-access'] as const)(
  'keeps business presets independent of runtime mode %s',
  async (mode) => {
    const f = fixture();
    f.context.setRaw('permissionMode', mode);
    await f.permissions.saveSettings('owner', {
      preset: 'full_auto',
      agentPresets: {},
      revision: 1,
    });
    expect(await checkMemoFlowToolPermission(f.permissions, 'routine_create', f.context)).toBe(
      'allow',
    );
    await f.permissions.saveSettings('owner', {
      preset: 'confirm_each',
      agentPresets: {},
      revision: 2,
    });
    expect(await checkMemoFlowToolPermission(f.permissions, 'routine_create', f.context)).toBe(
      'ask',
    );
    await f.permissions.saveSettings('owner', {
      preset: 'read_only',
      agentPresets: {},
      revision: 3,
    });
    expect(await checkMemoFlowToolPermission(f.permissions, 'routine_create', f.context)).toBe(
      'deny',
    );
  },
);

// The session business preset can narrow global grants, including under full machine access.
it.each([
  ['read_only', 'deny'],
  ['confirm_each', 'ask'],
  ['on_demand', 'ask'],
  ['full_auto', 'allow'],
] as const)(
  'applies the %s business ceiling independently of full-access',
  async (preset, expected) => {
    const f = fixture();
    f.context.setRaw('permissionMode', 'full-access');
    f.context.setRaw('conversationBusinessPreset', preset);
    await f.permissions.saveSettings('owner', {
      preset: 'full_auto',
      agentPresets: {},
      revision: 1,
    });
    await applyMemoFlowSessionToolPolicy(f.session, 'full-access', f.context);
    expect(await checkMemoFlowToolPermission(f.permissions, 'routine_create', f.context)).toBe(
      expected,
    );
    expect(f.session.resolveToolApproval('routine_create')).toBe(expected);
    await f.permissions.saveSettings('owner', {
      preset: 'read_only',
      agentPresets: {},
      revision: 2,
    });
    expect(await checkMemoFlowToolPermission(f.permissions, 'routine_create', f.context)).toBe(
      'deny',
    );
  },
);
