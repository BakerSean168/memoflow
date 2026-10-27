import { describe, expect, it, vi } from 'vitest';
import { ScheduleChannels } from '@memoflow/desktop-contracts';
import { ok } from '@memoflow/transport-contracts/result';

const eventControllerInstances: Array<{ delete: ReturnType<typeof vi.fn> }> = [];

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

vi.mock('../server/transport', () => {
  class MockScheduleEventController {
    getByTimeRange = vi.fn();
    get = vi.fn();
    create = vi.fn();
    update = vi.fn();
    delete = vi.fn().mockResolvedValue(ok(null));
    getConflicts = vi.fn();
    detectConflicts = vi.fn();
    createWithConflictDetection = vi.fn();
    resolveConflict = vi.fn();

    constructor(_api: unknown) {
      eventControllerInstances.push(this);
    }
  }

  class MockScheduleController {
    createTask = vi.fn();
    listTasks = vi.fn();
    getTask = vi.fn();
    deleteTask = vi.fn();
    pauseTask = vi.fn();
    resumeTask = vi.fn();
    triggerTask = vi.fn();
    completeTask = vi.fn();
    cancelTask = vi.fn();
    getDueTasks = vi.fn();
    batchDeleteTasks = vi.fn();
    updateTaskMetadata = vi.fn();

    constructor(_api: unknown) {}
  }

  return {
    ScheduleEventController: MockScheduleEventController,
    ScheduleController: MockScheduleController,
  };
});

import { ipcMain } from 'electron';
import { createScheduleElectronModule } from './index';

function getRegisteredHandler(
  channel: string,
): ((...args: unknown[]) => Promise<unknown>) | undefined {
  const handleMock = ipcMain.handle as unknown as ReturnType<typeof vi.fn>;
  const call = handleMock.mock.calls.find(([ch]) => ch === channel);
  return call?.[1] as ((...args: unknown[]) => Promise<unknown>) | undefined;
}

function createFakeContext() {
  return {
    db: {} as never,
    auth: {
      requireRequestContext: vi.fn().mockResolvedValue({
        identityId: 'ipc-user',
        deviceId: 'desktop',
        device: {
          deviceName: 'Desktop',
          os: 'linux',
          browser: null,
          ipAddress: null,
          userAgent: null,
          deviceType: 'Desktop',
        },
      }),
    },
  };
}

function createModule() {
  const instance = {
    api: {} as never,
    eventApi: {} as never,
    scheduleRepository: {} as never,
    scheduleExecutionRepository: {} as never,
    scheduleTaskRepository: {} as never,
    useCases: {} as never,
    start: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
  return createScheduleElectronModule({ instance: instance as never });
}

describe('Schedule DELETE IPC handler round-trip contract', () => {
  it('forwards (event, id, expectedVersion) to controller.delete(id, { expectedVersion }, requestContext)', async () => {
    const module = createModule();
    module.register(createFakeContext() as never);

    const deleteHandler = getRegisteredHandler(ScheduleChannels.DELETE);
    expect(deleteHandler).toBeDefined();

    const result = await deleteHandler?.({} as never, 'schedule-1', 7);

    expect(eventControllerInstances[0].delete).toHaveBeenCalledWith(
      'schedule-1',
      { expectedVersion: 7 },
      expect.objectContaining({ identityId: 'ipc-user' }),
    );
    expect(result).toMatchObject({ ok: true });
  });

  it('accepts a payload object and forwards it unchanged', async () => {
    const module = createModule();
    module.register(createFakeContext() as never);

    const deleteHandler = getRegisteredHandler(ScheduleChannels.DELETE);
    await deleteHandler?.({} as never, 'schedule-2', { expectedVersion: 11 });

    expect(eventControllerInstances[0].delete).toHaveBeenCalledWith(
      'schedule-2',
      { expectedVersion: 11 },
      expect.objectContaining({ identityId: 'ipc-user' }),
    );
  });
});
