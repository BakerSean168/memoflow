import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { TaskChannels, TaskWorkspaceChannels } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import { createTaskWorkspaceElectronModule } from './task-workspace.electron-module';

const PLAN_ID = 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440000';
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

describe('Task Workspace Electron module', () => {
  it('owns only TaskWorkspaceChannels and forwards authenticated validated reads', async () => {
    const port = { getWorkspace: vi.fn().mockResolvedValue(ok({ kind: 'workspace' })) };
    const module = createTaskWorkspaceElectronModule({ port: port as never });
    module.register({ db: {} as never, auth: { requireRequestContext: vi.fn().mockResolvedValue({ identityId: IDENTITY_ID }) } });

    await handlers.get(TaskWorkspaceChannels.GET)?.({}, { planId: PLAN_ID, recentLimit: 3 });
    expect(port.getWorkspace).toHaveBeenCalledWith(IDENTITY_ID, PLAN_ID, { recentLimit: 3 });
    expect(handlers.has(TaskChannels.PLAN_LIST)).toBe(false);
    module.destroy?.();
    expect(handlers.has(TaskWorkspaceChannels.GET)).toBe(false);
  });

  it('rejects invalid input without calling the port', async () => {
    const port = { getWorkspace: vi.fn() };
    const module = createTaskWorkspaceElectronModule({ port: port as never });
    module.register({ db: {} as never, auth: { requireRequestContext: vi.fn().mockResolvedValue({ identityId: IDENTITY_ID }) } });
    await expect(handlers.get(TaskWorkspaceChannels.GET)?.({}, { planId: 'bad' })).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(port.getWorkspace).not.toHaveBeenCalled();
  });
});
