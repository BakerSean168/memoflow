import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { GoalWorkspaceChannels } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import { createGoalWorkspaceElectronModule } from './goal-workspace.electron-module';

const GOAL_ID = 'IGoalId_550e8400-e29b-41d4-a716-446655440000';
const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440001';
const handlers = new Map<string, (...args: unknown[]) => unknown>();

beforeEach(() => {
  handlers.clear();
  vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
    handlers.set(channel, handler as (...args: unknown[]) => unknown);
  });
  vi.mocked(ipcMain.removeHandler).mockImplementation((channel) => {
    handlers.delete(channel);
  });
});

describe('Goal Workspace Electron module', () => {
  it('binds the three read operations to authenticated identity with canonical schemas', async () => {
    const port = {
      getWorkspace: vi.fn().mockResolvedValue(ok({ kind: 'workspace' })),
      listTasks: vi.fn().mockResolvedValue(ok({ kind: 'tasks' })),
      listKnowledge: vi.fn().mockResolvedValue(ok({ kind: 'knowledge' })),
    };
    const module = createGoalWorkspaceElectronModule({ port: port as never });
    module.register({
      db: {} as never,
      auth: { requireRequestContext: vi.fn().mockResolvedValue({ identityId: IDENTITY_ID }) },
    });

    await handlers.get(GoalWorkspaceChannels.GET)?.({}, { goalId: GOAL_ID, previewLimit: 3 });
    await handlers.get(GoalWorkspaceChannels.TASKS)?.({}, { goalId: GOAL_ID, limit: 7 });
    await handlers.get(GoalWorkspaceChannels.KNOWLEDGE)?.({}, { goalId: GOAL_ID, offset: 4 });

    expect(port.getWorkspace).toHaveBeenCalledWith(IDENTITY_ID, GOAL_ID, {
      previewLimit: 3,
      recentLimit: 5,
    });
    expect(port.listTasks).toHaveBeenCalledWith(IDENTITY_ID, GOAL_ID, {
      limit: 7,
      offset: 0,
    });
    expect(port.listKnowledge).toHaveBeenCalledWith(IDENTITY_ID, GOAL_ID, {
      limit: 20,
      offset: 4,
    });

    module.destroy?.();
    expect(handlers.size).toBe(0);
  });

  it('fails validation without calling the read port', async () => {
    const port = { getWorkspace: vi.fn(), listTasks: vi.fn(), listKnowledge: vi.fn() };
    const module = createGoalWorkspaceElectronModule({ port: port as never });
    module.register({
      db: {} as never,
      auth: { requireRequestContext: vi.fn().mockResolvedValue({ identityId: IDENTITY_ID }) },
    });
    const result = await handlers.get(GoalWorkspaceChannels.GET)?.({}, { goalId: 'bad' });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(port.getWorkspace).not.toHaveBeenCalled();
  });
});
