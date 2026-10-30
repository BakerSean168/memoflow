import { beforeEach, expect, it, vi } from 'vitest';
import { contextBridge, ipcRenderer } from 'electron';
import { GoalWorkspaceChannels } from '@memoflow/desktop-contracts';
import { createResultIpcClient, type ElectronBridge } from '@memoflow/ipc-client';
import { createPowerSyncSqliteFixture } from '@memoflow/test-utils/helpers/powersync-sqlite';
import { GoalIpcAdapter } from '@memoflow/goal-client';
import {
  GoalWorkspaceQueryService,
  createGoalPowerSyncRepositories,
  createGoalPowerSyncAgentMutations,
} from '@memoflow/goal';
import { createGoalWorkspaceElectronModule } from '../main/modules/goal/goal-workspace.electron-module';

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  },
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

it('allows every Goal Workspace read through the actual preload bridge', async () => {
  vi.resetModules();
  await import('./preload');
  const bridge = vi
    .mocked(contextBridge.exposeInMainWorld)
    .mock.calls.find(([name]) => name === 'electronAPI')?.[1] as ElectronBridge;
  const query = { goalId: 'IGoalId_550e8400-e29b-41d4-a716-446655440000' };
  vi.mocked(ipcRenderer.invoke).mockResolvedValue({ ok: true });
  for (const channel of Object.values(GoalWorkspaceChannels)) {
    await expect(bridge.invoke(channel, query)).resolves.toEqual({ ok: true });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(channel, query);
  }
  await expect(bridge.invoke('goal:unregistered', query)).rejects.toThrow('is not allowed');
});

it('reads a committed Native Goal through client, preload, authenticated Main and SQLite owner', async () => {
  vi.resetModules();
  await import('./preload');
  const bridge = vi
    .mocked(contextBridge.exposeInMainWorld)
    .mock.calls.find(([name]) => name === 'electronAPI')?.[1] as ElectronBridge;
  vi.mocked(ipcRenderer.invoke).mockImplementation(async (channel, ...args) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error('Missing Main handler');
    return handler({}, ...args);
  });
  const fixture = createPowerSyncSqliteFixture();
  const owner = 'IdentityId_550e8400-e29b-41d4-a716-446655440001';
  let identityId = owner;
  const unavailable = async (): Promise<never> => {
    throw new Error('offline');
  };
  const repositories = createGoalPowerSyncRepositories(fixture.db);
  const module = createGoalWorkspaceElectronModule({
    port: new GoalWorkspaceQueryService({
      ...repositories,
      taskContextReadPort: {
        getTaskGoalContextSummary: unavailable,
        listTasksByGoal: unavailable,
        listTasksByKeyResult: unavailable,
      },
      knowledgeRelationReadPort: { listEdgeRefsForGoal: unavailable },
      knowledgeContextReadPort: { resolveForWorkspace: unavailable },
    }),
  });
  module.register({
    db: fixture.db,
    auth: { requireRequestContext: async () => ({ identityId }) },
  });
  try {
    const receipt = await createGoalPowerSyncAgentMutations(fixture.db, {
      publish: async () => {},
    }).create(
      { idempotencyKey: 'bridge-create', goal: { name: 'Native Goal bridge' } },
      { identityId, traceId: 'bridge', requestId: 'bridge', source: 'ipc', startedAt: 1 },
      { connectionId: 'bridge-test', authorize: async () => {} },
    );
    const client = new GoalIpcAdapter(createResultIpcClient({ bridge, enableLogging: false }));
    await expect(client.getGoalWorkspace(receipt.result.goalId)).resolves.toMatchObject({
      ok: true,
      data: {
        goal: {
          id: receipt.result.goalId,
          name: 'Native Goal bridge',
          version: receipt.result.goalVersion,
        },
      },
    });
    identityId = 'IdentityId_550e8400-e29b-41d4-a716-446655440002';
    await expect(client.getGoalWorkspace(receipt.result.goalId)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  } finally {
    module.destroy?.();
    handlers.clear();
    fixture.close();
  }
}, 30_000);
