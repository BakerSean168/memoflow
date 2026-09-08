import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExecutionStatus,
  ScheduleTaskStatus,
  SourceModule,
  Timezone,
} from '@memoflow/contracts/schedule';
import { ScheduleTask } from '../../domain/aggregates/schedule-task';
import type { IScheduleTaskRepository } from '../../domain/repositories/i-schedule-task-repository';
import {
  ExecutionInfo,
  RetryPolicy,
  ScheduleConfig,
  ScheduleTaskMetadata,
} from '../../domain/value-objects';
import { ScheduleTaskId } from '../../domain/value-objects/schedule-task-id';
import { ScheduledHandlerRegistry, buildSchedulingKey } from '../../../scheduling';
import {
  createHandlerRegistryScheduleTaskSourceExecutor,
  createScheduleTaskSchedulingPort,
} from '../scheduling';

const mocked = vi.hoisted(() => {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const queueInstances: Array<Record<string, unknown>> = [];
  const loggerInfo = vi.fn();
  const loggerWarn = vi.fn();
  const loggerError = vi.fn();

  const on = vi.fn((event: string, handler: (payload: unknown) => void) => {
    const eventHandlers = handlers.get(event) ?? new Set<(payload: unknown) => void>();
    eventHandlers.add(handler);
    handlers.set(event, eventHandlers);
  });

  const off = vi.fn((event: string, handler: (payload: unknown) => void) => {
    handlers.get(event)?.delete(handler);
  });

  const emit = (event: string, payload: unknown) => {
    for (const handler of [...(handlers.get(event) ?? [])]) {
      handler(payload);
    }
  };

  const reset = () => {
    handlers.clear();
    queueInstances.length = 0;
    on.mockClear();
    off.mockClear();
    loggerInfo.mockClear();
    loggerWarn.mockClear();
    loggerError.mockClear();
  };

  return {
    emit,
    eventBus: { on, off },
    loggerError,
    loggerInfo,
    loggerWarn,
    queueInstances,
    reset,
  };
});

vi.mock('@memoflow/utils/domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/utils/domain')>();

  return {
    ...actual,
    eventBus: mocked.eventBus,
    createTypedEventSubscriber: (source: typeof mocked.eventBus) => ({
      on: source.on,
      off: source.off,
    }),
  };
});

vi.mock('@memoflow/utils/logger', () => ({
  createLogger: () => ({
    info: mocked.loggerInfo,
    warn: mocked.loggerWarn,
    error: mocked.loggerError,
  }),
}));

vi.mock('../../application/scheduler/schedule-task-queue', () => {
  class MockScheduleTaskQueue {
    public readonly addTask = vi.fn();
    public readonly removeTask = vi.fn();
    public readonly stop = vi.fn();
    public readonly drain = vi.fn().mockResolvedValue(undefined);
    public loadedItems: unknown[] = [];
    public startPromise: Promise<void> | null = null;

    constructor(public readonly config: Record<string, unknown>) {
      mocked.queueInstances.push(this as unknown as Record<string, unknown>);
    }

    start(): Promise<void> {
      this.startPromise = (async () => {
        const taskLoader = this.config.taskLoader as
          { loadActiveTasks(): Promise<unknown[]> } | undefined;
        this.loadedItems = taskLoader ? await taskLoader.loadActiveTasks() : [];
      })();

      return this.startPromise;
    }
  }

  return { ScheduleTaskQueue: MockScheduleTaskQueue };
});

import { createSchedulerRuntimeContribution } from './schedule.runtime';

interface MockQueueInstance {
  readonly addTask: ReturnType<typeof vi.fn>;
  readonly removeTask: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
  readonly drain: ReturnType<typeof vi.fn>;
  readonly config: {
    readonly taskLoader?: { loadActiveTasks(): Promise<unknown[]> };
    readonly onExecuteTask: (taskId: string, item: { identityId: string }) => Promise<void>;
    readonly onExecuteError?: (taskId: string, error: Error) => void;
  };
  loadedItems: unknown[];
  startPromise: Promise<void> | null;
  start(): Promise<void>;
}

type ScheduleTaskRepositoryMock = IScheduleTaskRepository & {
  save: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findByIdForIdentity: ReturnType<typeof vi.fn>;
  deleteById: ReturnType<typeof vi.fn>;
  findByIdentityId: ReturnType<typeof vi.fn>;
  findBySourceModule: ReturnType<typeof vi.fn>;
  findBySourceEntity: ReturnType<typeof vi.fn>;
  findBySchedulingOwner: ReturnType<typeof vi.fn>;
  appendSchedulingReconcileReceipt: ReturnType<typeof vi.fn>;
  findByStatus: ReturnType<typeof vi.fn>;
  findEnabled: ReturnType<typeof vi.fn>;
  findDueTasksForExecution: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  saveBatch: ReturnType<typeof vi.fn>;
  deleteBatch: ReturnType<typeof vi.fn>;
  withTransaction: ReturnType<typeof vi.fn>;
};

function createRepositoryMock(): ScheduleTaskRepositoryMock {
  const repository = {
    save: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    findByIdForIdentity: vi.fn(async () => null),
    deleteById: vi.fn(async () => undefined),
    findByIdentityId: vi.fn(async () => []),
    findBySourceModule: vi.fn(async () => []),
    findBySourceEntity: vi.fn(async () => []),
    findBySchedulingOwner: vi.fn(async () => []),
    appendSchedulingReconcileReceipt: vi.fn(async () => undefined),
    findByStatus: vi.fn(async () => []),
    findEnabled: vi.fn(async () => []),
    findDueTasksForExecution: vi.fn(async () => []),
    query: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    saveBatch: vi.fn(async () => undefined),
    deleteBatch: vi.fn(async () => undefined),
    claimForExecution: vi.fn(async () => true),
    withTransaction: vi.fn(),
  } as unknown as ScheduleTaskRepositoryMock;

  repository.withTransaction.mockImplementation(
    async (fn: (repo: IScheduleTaskRepository) => Promise<unknown>) => fn(repository),
  );

  return repository;
}

function recurringSchedule(): ScheduleConfig {
  return ScheduleConfig.fromDTO({
    cronExpression: '0 0 9 * * *',
    timezone: Timezone.Shanghai,
    startDate: null,
    endDate: null,
    maxExecutions: null,
  });
}

function oneShotPastSchedule(
  startTime: number,
  maxExecutions: number | null = 1,
): ScheduleConfig {
  return ScheduleConfig.fromDTO({
    cronExpression: null,
    timezone: Timezone.Shanghai,
    startDate: new Date(startTime).toISOString(),
    endDate: null,
    maxExecutions,
  });
}

function createLoadedTask(
  overrides: Partial<{
    id: string;
    identityId: string;
    name: string;
    sourceModule: SourceModule;
    sourceEntityId: string;
    status: ScheduleTaskStatus;
    enabled: boolean;
    nextRunAt: number | null;
    retryPolicy: RetryPolicy;
    schedule: ScheduleConfig;
    metadata: ScheduleTaskMetadata;
  }> = {},
): ScheduleTask {
  const now = Date.now();
  const nextRunAt = overrides.nextRunAt ?? now + 60_000;

  return ScheduleTask.load({
    id: (overrides.id ?? ScheduleTaskId.generate()) as ReturnType<typeof ScheduleTaskId.generate>,
    identityId: overrides.identityId ?? 'identity-1',
    name: overrides.name ?? 'Runtime Task',
    description: null,
    sourceModule: overrides.sourceModule ?? SourceModule.Task,
    sourceEntityId: overrides.sourceEntityId ?? 'source-1',
    status: overrides.status ?? ScheduleTaskStatus.Active,
    enabled: overrides.enabled ?? true,
    schedule: overrides.schedule ?? recurringSchedule(),
    execution: ExecutionInfo.fromDTO({
      nextRunAt: nextRunAt === null ? null : new Date(nextRunAt).toISOString(),
      lastRunAt: null,
      executionCount: 0,
      lastExecutionStatus: null,
      lastExecutionDuration: null,
      consecutiveFailures: 0,
    }),
    retryPolicy: overrides.retryPolicy ?? RetryPolicy.createDefault(),
    metadata:
      overrides.metadata ??
      ScheduleTaskMetadata.create({
        payload: { foo: 'bar' },
        tags: ['runtime'],
        priority: 'Normal',
        timeout: null,
      }),
    createdAt: new Date(now),
    updatedAt: new Date(now),
    version: 1,
    deletedAt: null,
  });
}

async function flushAsyncWork(): Promise<void> {
  // Runtime sync now may await findById + findByIdForIdentity before mutating the queue.
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
}

function getLastQueue(): MockQueueInstance {
  const queue = mocked.queueInstances[mocked.queueInstances.length - 1] as
    MockQueueInstance | undefined;
  if (!queue) {
    throw new Error('Expected a mocked queue instance');
  }

  return queue;
}

describe('createSchedulerRuntimeContribution', () => {
  beforeEach(() => {
    mocked.reset();
  });

  it('loads enabled tasks on start, filters them by shouldScheduleTask, and subscribes once', async () => {
    const allowedTask = createLoadedTask({ id: 'task-allowed' });
    const blockedTask = createLoadedTask({ id: 'task-blocked', identityId: 'identity-2' });
    const repository = createRepositoryMock();
    repository.findEnabled.mockResolvedValue([allowedTask, blockedTask]);

    const runtime = createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      shouldScheduleTask: (task) => task.identityId === 'identity-1',
      sourceExecutor: { execute: vi.fn(async () => undefined) },
    });

    await runtime.start();
    const queue = getLastQueue();

    expect(repository.findEnabled).toHaveBeenCalledTimes(1);
    expect(queue.loadedItems).toEqual([
      expect.objectContaining({
        taskId: 'task-allowed',
        taskName: allowedTask.name,
        identityId: 'identity-1',
        nextRunAt: allowedTask.execution.nextRunAt,
      }),
    ]);
    expect(mocked.eventBus.on).toHaveBeenCalledTimes(9);

    await runtime.start();
    expect(mocked.eventBus.on).toHaveBeenCalledTimes(9);
  });

  it('surfaces queue startup failures, unregisters listeners, and allows retry', async () => {
    const repository = createRepositoryMock();
    repository.findEnabled
      .mockRejectedValueOnce(new Error('loader failed'))
      .mockResolvedValueOnce([]);

    const runtime = createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      sourceExecutor: { execute: vi.fn(async () => undefined) },
    });

    await expect(runtime.start()).rejects.toThrow('loader failed');

    expect(mocked.eventBus.on).toHaveBeenCalledTimes(9);
    expect(mocked.eventBus.off).toHaveBeenCalledTimes(9);
    expect(mocked.loggerInfo).not.toHaveBeenCalledWith('[Schedule] Runtime contribution started');

    await runtime.start();

    expect(repository.findEnabled).toHaveBeenCalledTimes(2);
    expect(mocked.eventBus.on).toHaveBeenCalledTimes(18);
    expect(mocked.loggerInfo).toHaveBeenCalledWith('[Schedule] Runtime contribution started');
  });

  it('promotes a standby host after the scheduler lease becomes available', async () => {
    vi.useFakeTimers();
    try {
      const repository = createRepositoryMock();
      repository.findEnabled.mockResolvedValue([]);
      const leaseCoordinator = {
        acquire: vi
          .fn()
          .mockResolvedValueOnce({ acquired: false })
          .mockResolvedValueOnce({ acquired: true, ownerToken: 'standby-owner' }),
        release: vi.fn(async () => undefined),
      };
      const runtime = createSchedulerRuntimeContribution({
        scheduleTaskRepository: repository,
        sourceExecutor: { execute: vi.fn(async () => undefined) },
        leaseCoordinator: leaseCoordinator as never,
        leaseRetryIntervalMs: 250,
      });

      await runtime.start();
      const queue = getLastQueue();
      expect(leaseCoordinator.acquire).toHaveBeenCalledTimes(1);
      expect(queue.startPromise).toBeNull();
      expect(mocked.eventBus.on).toHaveBeenCalledTimes(9);

      await vi.advanceTimersByTimeAsync(250);
      await flushAsyncWork();

      expect(leaseCoordinator.acquire).toHaveBeenCalledTimes(2);
      expect(queue.startPromise).not.toBeNull();
      expect(repository.findEnabled).toHaveBeenCalledTimes(1);
      expect(mocked.eventBus.on).toHaveBeenCalledTimes(9);
      expect(mocked.loggerInfo).toHaveBeenCalledWith(
        '[Schedule] Standby host promoted to scheduler (lease held)',
      );

      await runtime.stop();
      expect(leaseCoordinator.release).toHaveBeenCalledWith('schedule-host', 'standby-owner');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels standby lease retries when the runtime stops before promotion', async () => {
    vi.useFakeTimers();
    try {
      const repository = createRepositoryMock();
      const leaseCoordinator = {
        acquire: vi.fn(async () => ({ acquired: false })),
        release: vi.fn(async () => undefined),
      };
      const runtime = createSchedulerRuntimeContribution({
        scheduleTaskRepository: repository,
        sourceExecutor: { execute: vi.fn(async () => undefined) },
        leaseCoordinator: leaseCoordinator as never,
        leaseRetryIntervalMs: 250,
      });

      await runtime.start();
      expect(leaseCoordinator.acquire).toHaveBeenCalledTimes(1);

      await runtime.stop();
      await vi.advanceTimersByTimeAsync(1_000);
      await flushAsyncWork();

      expect(leaseCoordinator.acquire).toHaveBeenCalledTimes(1);
      expect(leaseCoordinator.release).not.toHaveBeenCalled();
      expect(mocked.eventBus.off).toHaveBeenCalledTimes(9);
    } finally {
      vi.useRealTimers();
    }
  });

  it('syncs schedulable tasks into the queue for live runtime events', async () => {
    const task = createLoadedTask({ id: 'task-sync', nextRunAt: Date.now() + 120_000 });
    const repository = createRepositoryMock();
    repository.findById.mockResolvedValue(task);
    repository.findByIdForIdentity.mockResolvedValue(task);

    const runtime = createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      sourceExecutor: { execute: vi.fn(async () => undefined) },
    });

    await runtime.start();
    const queue = getLastQueue();

    for (const eventName of [
      'schedule:task-created',
      'schedule:task-schedule-updated',
      'schedule:task-resumed',
      'schedule:task-executed',
    ]) {
      mocked.emit(eventName, { taskId: task.id });
    }
    await flushAsyncWork();

    expect(repository.findById).toHaveBeenCalledTimes(4);
    expect(repository.findByIdForIdentity).toHaveBeenCalledTimes(4);
    expect(repository.findByIdForIdentity).toHaveBeenCalledWith('identity-1', task.id);
    expect(queue.addTask).toHaveBeenCalledTimes(4);
    expect(queue.addTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        taskId: task.id,
        taskName: task.name,
        identityId: 'identity-1',
        metadata: task.metadata.toDTO().payload,
      }),
    );
  });

  it('logs sync handler failures instead of leaking an unhandled rejection', async () => {
    const repository = createRepositoryMock();
    repository.findById.mockRejectedValue(new Error('db unavailable'));

    const runtime = createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      sourceExecutor: { execute: vi.fn(async () => undefined) },
    });

    await runtime.start();

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      mocked.emit('schedule:task-created', { taskId: 'task-error' });
      await flushAsyncWork();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(unhandled).toHaveLength(0);
    expect(mocked.loggerError).toHaveBeenCalledWith(
      '[Schedule] Task sync event handler failed',
      expect.objectContaining({
        event: 'schedule:task-created',
        taskId: 'task-error',
        error: 'db unavailable',
      }),
    );
  });

  it('removes tasks from the queue when sync finds a task outside the runtime scope', async () => {
    const task = createLoadedTask({ id: 'task-blocked' });
    const repository = createRepositoryMock();
    repository.findById.mockResolvedValue(task);
    repository.findByIdForIdentity.mockResolvedValue(task);

    const runtime = createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      shouldScheduleTask: () => false,
      sourceExecutor: { execute: vi.fn(async () => undefined) },
    });

    await runtime.start();
    const queue = getLastQueue();

    mocked.emit('schedule:task-created', { taskId: task.id });
    await flushAsyncWork();

    expect(queue.addTask).not.toHaveBeenCalled();
    expect(queue.removeTask).toHaveBeenCalledWith(task.id);
  });

  it('removes queued tasks for pause, completion, cancellation, failure, and deletion events', async () => {
    const repository = createRepositoryMock();
    const runtime = createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      sourceExecutor: { execute: vi.fn(async () => undefined) },
    });

    await runtime.start();
    const queue = getLastQueue();

    for (const eventName of [
      'schedule:task-paused',
      'schedule:task-completed',
      'schedule:task-cancelled',
      'schedule:task-failed',
      'schedule:task-deleted',
    ]) {
      mocked.emit(eventName, { taskId: 'task-remove' });
    }

    expect(queue.removeTask).toHaveBeenCalledTimes(5);
    expect(queue.removeTask).toHaveBeenNthCalledWith(1, 'task-remove');
  });

  it('executes a neutral scheduled intent through the existing queue and HandlerRegistry', async () => {
    const repository = createRepositoryMock();
    let persistedTask: ScheduleTask | undefined;
    repository.findBySourceEntity.mockResolvedValue([]);
    repository.findByIdForIdentity.mockImplementation(async (_identityId, id) =>
      persistedTask?.id === id ? persistedTask : null,
    );
    repository.saveBatch.mockImplementation(async (tasks: ScheduleTask[]) => {
      persistedTask = tasks[0];
    });

    const owner = { identityId: 'identity-1', type: 'fake-module', id: 'queue-owner' };
    const schedulingPort = createScheduleTaskSchedulingPort(repository);
    await schedulingPort.reconcile(owner, [
      {
        schedulingKey: buildSchedulingKey('fake-module', 'queue-owner', 'fire'),
        handlerKey: 'fake.fire',
        runAt: Date.now() - 1_000,
        payloadVersion: 1,
        payload: { value: 42 },
      },
    ]);
    expect(persistedTask).toBeDefined();

    const handler = vi.fn(async () => ({ status: 'succeeded' as const }));
    const registry = new ScheduledHandlerRegistry();
    registry.register({
      handlerKey: 'fake.fire',
      payloadVersion: 1,
      validatePayload(payload: unknown) {
        if ((payload as { value?: unknown })?.value !== 42) {
          throw new TypeError('value must equal 42');
        }
        return payload as { value: 42 };
      },
      handler: { execute: handler },
    });

    createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      sourceExecutor: createHandlerRegistryScheduleTaskSourceExecutor({ registry }),
    });
    const queue = getLastQueue();
    await queue.config.onExecuteTask(persistedTask!.id, { identityId: owner.identityId });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        owner,
        handlerKey: 'fake.fire',
        payloadVersion: 1,
        payload: { value: 42 },
      }),
    );
    expect(persistedTask!.execution.lastExecutionStatus).toBe(ExecutionStatus.Success);
    expect(persistedTask!.status).toBe(ScheduleTaskStatus.Completed);
  });

  it('executes due tasks through the source executor and persists the updated aggregate', async () => {
    const task = createLoadedTask({ id: 'task-execute', nextRunAt: Date.now() - 60_000 });
    const repository = createRepositoryMock();
    repository.findByIdForIdentity.mockResolvedValue(task);
    const sourceExecutor = {
      execute: vi.fn(async () => ({ nextRunAt: Date.now() + 300_000, result: { ok: true } })),
    };

    createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      sourceExecutor,
    });
    const queue = getLastQueue();

    await queue.config.onExecuteTask(task.id, { identityId: String(task.identityId) });

    expect(repository.findByIdForIdentity).toHaveBeenCalledWith('identity-1', task.id);
    expect(repository.findById).not.toHaveBeenCalled();
    expect(sourceExecutor.execute).toHaveBeenCalledWith(task);
    expect(repository.save).toHaveBeenCalledWith(task);
    expect(task.execution.executionCount).toBe(1);
    expect(task.execution.lastExecutionStatus).toBe(ExecutionStatus.Success);
    expect(task.status).toBe(ScheduleTaskStatus.Active);
  });

  it('R3b: skips execution when the atomic claim fails (another host already claimed)', async () => {
    const task = createLoadedTask({ id: 'task-claim-conflict', nextRunAt: Date.now() - 60_000 });
    const repository = createRepositoryMock();
    repository.findByIdForIdentity.mockResolvedValue(task);
    repository.claimForExecution.mockResolvedValue(false);
    const sourceExecutor = {
      execute: vi.fn(async () => ({ nextRunAt: Date.now() + 300_000, result: { ok: true } })),
    };

    createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      sourceExecutor,
    });
    const queue = getLastQueue();

    await queue.config.onExecuteTask(task.id, { identityId: String(task.identityId) });

    expect(repository.claimForExecution).toHaveBeenCalledWith(
      task.id,
      new Date(task.execution.nextRunAt),
    );
    expect(sourceExecutor.execute).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(task.execution.executionCount).toBe(0);
  });

  it('marks execution as failed when source execution throws and no retry can be scheduled', async () => {
    const startTime = Date.now() - 120_000;
    const task = createLoadedTask({
      id: 'task-failure',
      nextRunAt: startTime,
      retryPolicy: RetryPolicy.createDisabled(),
      schedule: oneShotPastSchedule(startTime),
    });
    const repository = createRepositoryMock();
    repository.findByIdForIdentity.mockResolvedValue(task);
    const sourceExecutor = {
      execute: vi.fn(async () => {
        throw new Error('boom');
      }),
    };

    createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      sourceExecutor,
    });
    const queue = getLastQueue();

    await queue.config.onExecuteTask(task.id, { identityId: String(task.identityId) });

    expect(repository.findByIdForIdentity).toHaveBeenCalledWith('identity-1', task.id);
    expect(repository.save).toHaveBeenCalledWith(task);
    expect(task.execution.executionCount).toBe(1);
    expect(task.execution.lastExecutionStatus).toBe(ExecutionStatus.Failed);
    expect(task.status).toBe(ScheduleTaskStatus.Failed);
    expect(mocked.loggerError).toHaveBeenCalledWith(
      '[Schedule] Source executor failed',
      expect.objectContaining({ taskId: task.id, error: 'boom', retryScheduledAt: null }),
    );
  });

  it('retries a one-shot logical invocation when maxExecutions does not cap technical attempts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
    try {
      const startTime = Date.now() - 60_000;
      const task = createLoadedTask({
        id: 'task-retry-one-shot',
        nextRunAt: startTime,
        retryPolicy: RetryPolicy.createDefault(),
        schedule: oneShotPastSchedule(startTime, null),
      });
      const repository = createRepositoryMock();
      repository.findByIdForIdentity.mockResolvedValue(task);
      const sourceExecutor = {
        execute: vi
          .fn()
          .mockRejectedValueOnce(new Error('temporary'))
          .mockResolvedValueOnce({ nextRunAt: null, result: { ok: true } }),
      };

      createSchedulerRuntimeContribution({
        scheduleTaskRepository: repository,
        sourceExecutor,
      });
      const queue = getLastQueue();

      await queue.config.onExecuteTask(task.id, { identityId: String(task.identityId) });
      expect(sourceExecutor.execute).toHaveBeenCalledTimes(1);
      expect(task.execution.lastExecutionStatus).toBe(ExecutionStatus.Failed);
      expect(task.status).toBe(ScheduleTaskStatus.Active);
      expect(task.execution.nextRunAt).toBe(Date.now() + 5_000);

      await vi.advanceTimersByTimeAsync(5_000);
      await queue.config.onExecuteTask(task.id, { identityId: String(task.identityId) });

      expect(sourceExecutor.execute).toHaveBeenCalledTimes(2);
      expect(task.execution.executionCount).toBe(2);
      expect(task.execution.lastExecutionStatus).toBe(ExecutionStatus.Success);
      expect(task.execution.nextRunAt).toBeNull();
      expect(task.status).toBe(ScheduleTaskStatus.Completed);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats an explicit skipped disposition as a successful terminal outcome', async () => {
    const startTime = Date.now() - 120_000;
    const task = createLoadedTask({
      id: 'task-skipped-terminal',
      nextRunAt: startTime,
      retryPolicy: RetryPolicy.createDefault(),
      schedule: oneShotPastSchedule(startTime, null),
    });
    const repository = createRepositoryMock();
    repository.findByIdForIdentity.mockResolvedValue(task);
    const sourceExecutor = {
      execute: vi.fn(async () => ({
        disposition: 'skipped' as const,
        nextRunAt: null,
        error: 'authoritative state no longer requires work',
      })),
    };

    createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      sourceExecutor,
    });
    const queue = getLastQueue();

    await queue.config.onExecuteTask(task.id, { identityId: String(task.identityId) });

    expect(task.execution.lastExecutionStatus).toBe(ExecutionStatus.Skipped);
    expect(task.execution.nextRunAt).toBeNull();
    expect(task.status).toBe(ScheduleTaskStatus.Completed);
  });

  it('treats an explicit dead-letter disposition as terminal even when retry is enabled', async () => {
    const startTime = Date.now() - 120_000;
    const task = createLoadedTask({
      id: 'task-dead-letter',
      nextRunAt: startTime,
      retryPolicy: RetryPolicy.createDefault(),
      schedule: oneShotPastSchedule(startTime),
    });
    const repository = createRepositoryMock();
    repository.findByIdForIdentity.mockResolvedValue(task);
    const sourceExecutor = {
      execute: vi.fn(async () => ({
        disposition: 'dead_letter' as const,
        nextRunAt: null,
        error: 'No scheduled handler is registered for key: fake.missing',
        result: { schedulingFailureCode: 'UNKNOWN_HANDLER' },
      })),
    };

    createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      sourceExecutor,
    });
    const queue = getLastQueue();

    await queue.config.onExecuteTask(task.id, { identityId: String(task.identityId) });

    expect(sourceExecutor.execute).toHaveBeenCalledWith(task);
    expect(repository.save).toHaveBeenCalledWith(task);
    expect(task.execution.executionCount).toBe(1);
    expect(task.execution.lastExecutionStatus).toBe(ExecutionStatus.Failed);
    expect(task.execution.nextRunAt).toBeNull();
    expect(task.status).toBe(ScheduleTaskStatus.Failed);
    expect(mocked.loggerError).not.toHaveBeenCalledWith(
      '[Schedule] Source executor failed',
      expect.anything(),
    );
    expect(mocked.loggerInfo).toHaveBeenCalledWith(
      '[Schedule] Source executor completed',
      expect.objectContaining({
        taskId: task.id,
        disposition: 'dead_letter',
        nextRunAt: null,
      }),
    );
  });

  it('prefers findByIdForIdentity when sync events carry identityId', async () => {
    const task = createLoadedTask({ id: 'task-owned-sync', identityId: 'identity-owned' });
    const repository = createRepositoryMock();
    repository.findByIdForIdentity.mockResolvedValue(task);

    const runtime = createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      sourceExecutor: { execute: vi.fn(async () => undefined) },
    });

    await runtime.start();
    const queue = getLastQueue();

    mocked.emit('schedule:task-executed', {
      taskId: task.id,
      identityId: 'identity-owned',
    });
    await flushAsyncWork();

    expect(repository.findByIdForIdentity).toHaveBeenCalledWith('identity-owned', task.id);
    expect(repository.findById).not.toHaveBeenCalled();
    expect(queue.addTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: task.id,
        identityId: 'identity-owned',
      }),
    );
  });

  it('skips execution when identity-scoped load returns null', async () => {
    const repository = createRepositoryMock();
    repository.findByIdForIdentity.mockResolvedValue(null);
    const sourceExecutor = { execute: vi.fn(async () => undefined) };

    createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      sourceExecutor,
    });
    const queue = getLastQueue();

    await queue.config.onExecuteTask('missing-task', { identityId: 'identity-1' });

    expect(repository.findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'missing-task');
    expect(sourceExecutor.execute).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('logs queue execution failures through onExecuteError', () => {
    const repository = createRepositoryMock();
    createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      sourceExecutor: { execute: vi.fn(async () => undefined) },
    });
    const queue = getLastQueue();
    const error = new Error('queue exploded');

    queue.config.onExecuteError?.('task-error', error);

    expect(mocked.loggerError).toHaveBeenCalledWith('[Schedule] Queue execution failed', {
      taskId: 'task-error',
      error: 'queue exploded',
    });
  });

  it('unsubscribes runtime listeners and stops the queue on stop', async () => {
    const repository = createRepositoryMock();
    const runtime = createSchedulerRuntimeContribution({
      scheduleTaskRepository: repository,
      sourceExecutor: { execute: vi.fn(async () => undefined) },
    });

    await runtime.start();
    const queue = getLastQueue();

    // R1-3：stop 为 async（先 drain 再停队列）。
    await runtime.stop();

    expect(mocked.eventBus.off).toHaveBeenCalledTimes(9);
    expect(queue.stop).toHaveBeenCalledTimes(1);
  });
});
