import { describe, expect, it, vi } from 'vitest';
import { ScheduleTaskStatus, SourceModule } from '@memoflow/contracts/schedule';
import type {
  IScheduleTaskQueryOptions,
  IScheduleTaskRepository,
} from '../../../domain/repositories/i-schedule-task-repository';
import { ScheduleTask } from '../../../domain/aggregates/schedule-task';
import {
  ExecutionInfo,
  RetryPolicy,
  ScheduleConfig,
  ScheduleTaskMetadata,
} from '../../../domain/value-objects';
import type {
  ScheduledIntent,
  SchedulingOwner,
  SchedulingReconcileReceipt,
} from '../../../../scheduling';
import {
  ScheduledHandlerRegistry,
  SchedulingReconcileError,
  buildSchedulingKey,
} from '../../../../scheduling';
import { projectFakeModuleScheduling } from '../../../../scheduling/__tests__/fake-module.fixture';
import {
  createHandlerRegistryScheduleTaskSourceExecutor,
  createScheduleTaskSchedulingPort,
  toScheduledInvocationContext,
  type ScheduleTaskSchedulingAdapterOptions,
} from '../legacy-schedule-task-scheduling.adapter';

function cloneTask(task: ScheduleTask): ScheduleTask {
  return ScheduleTask.load({
    id: task.id,
    identityId: task.identityId,
    name: task.name,
    description: task.description,
    sourceModule: task.sourceModule,
    sourceEntityId: task.sourceEntityId,
    status: task.status,
    enabled: task.enabled,
    schedule: ScheduleConfig.fromDTO(task.schedule.toDTO()),
    execution: ExecutionInfo.fromDTO(task.execution.toDTO()),
    retryPolicy: RetryPolicy.fromDTO(task.retryPolicy.toDTO()),
    metadata: ScheduleTaskMetadata.fromDTO(task.metadata.toDTO()),
    createdAt: new Date(task.createdAt),
    updatedAt: new Date(task.updatedAt),
    version: task.version,
    deletedAt: task.deletedAt ? new Date(task.deletedAt) : null,
  });
}

class TransactionalInMemoryScheduleTaskRepository implements IScheduleTaskRepository {
  private tasks: Map<string, ScheduleTask>;
  private receipts: Map<string, SchedulingReconcileReceipt>;

  constructor(
    tasks: readonly ScheduleTask[] = [],
    receipts: readonly SchedulingReconcileReceipt[] = [],
  ) {
    this.tasks = new Map(tasks.map((task) => [task.id, cloneTask(task)]));
    this.receipts = new Map(receipts.map((receipt) => [receipt.operationId, receipt]));
  }

  private all(): ScheduleTask[] {
    return [...this.tasks.values()];
  }

  async save(task: ScheduleTask): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async findById(id: string): Promise<ScheduleTask | null> {
    return this.tasks.get(id) ?? null;
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<ScheduleTask | null> {
    const task = this.tasks.get(id);
    return task && String(task.identityId) === identityId ? task : null;
  }

  async deleteById(identityId: string, id: string): Promise<void> {
    const task = await this.findByIdForIdentity(identityId, id);
    if (!task) throw new Error('not found');
    this.tasks.delete(id);
  }

  async findByIdentityId(identityId: string): Promise<ScheduleTask[]> {
    return this.all().filter((task) => String(task.identityId) === identityId);
  }

  async findBySourceModule(module: SourceModule, identityId: string): Promise<ScheduleTask[]> {
    return this.all().filter(
      (task) => task.sourceModule === module && String(task.identityId) === identityId,
    );
  }

  async findBySourceEntity(
    module: SourceModule,
    entityId: string,
    identityId: string,
  ): Promise<ScheduleTask[]> {
    return this.all().filter(
      (task) =>
        task.sourceModule === module &&
        task.sourceEntityId === entityId &&
        String(task.identityId) === identityId,
    );
  }

  async findBySchedulingOwner(owner: SchedulingOwner): Promise<ScheduleTask[]> {
    return this.all().filter((task) => {
      const invocation = toScheduledInvocationContext(task);
      return (
        invocation?.owner.identityId === owner.identityId &&
        invocation.owner.type === owner.type &&
        invocation.owner.id === owner.id
      );
    });
  }

  async appendSchedulingReconcileReceipt(receipt: SchedulingReconcileReceipt): Promise<void> {
    if (this.receipts.has(receipt.operationId)) throw new Error('duplicate operation receipt');
    this.receipts.set(receipt.operationId, receipt);
  }

  getReceipt(operationId: string): SchedulingReconcileReceipt | undefined {
    return this.receipts.get(operationId);
  }

  get receiptCount(): number {
    return this.receipts.size;
  }

  async findByStatus(status: ScheduleTaskStatus, identityId: string): Promise<ScheduleTask[]> {
    return this.all().filter(
      (task) => task.status === status && String(task.identityId) === identityId,
    );
  }

  async findEnabled(identityId?: string): Promise<ScheduleTask[]> {
    return this.all().filter(
      (task) =>
        task.enabled &&
        task.status === ScheduleTaskStatus.Active &&
        (identityId === undefined || String(task.identityId) === identityId),
    );
  }

  async claimForExecution(id: string, expectedNextRunAt: Date): Promise<boolean> {
    const task = this.tasks.get(id);
    return Boolean(
      task &&
      task.enabled &&
      task.status === ScheduleTaskStatus.Active &&
      task.nextRunAt?.getTime() === expectedNextRunAt.getTime(),
    );
  }

  async findDueTasksForExecution(beforeTime: Date, limit?: number): Promise<ScheduleTask[]> {
    const due = this.all()
      .filter(
        (task) =>
          task.enabled &&
          task.status === ScheduleTaskStatus.Active &&
          task.nextRunAt !== null &&
          task.nextRunAt <= beforeTime,
      )
      .sort((a, b) => (a.nextRunAt?.getTime() ?? 0) - (b.nextRunAt?.getTime() ?? 0));
    return limit === undefined ? due : due.slice(0, limit);
  }

  async query(options: IScheduleTaskQueryOptions): Promise<ScheduleTask[]> {
    let tasks = this.all().filter((task) => String(task.identityId) === options.identityId);
    if (options.sourceModule)
      tasks = tasks.filter((task) => task.sourceModule === options.sourceModule);
    if (options.sourceEntityId) {
      tasks = tasks.filter((task) => task.sourceEntityId === options.sourceEntityId);
    }
    if (options.status) tasks = tasks.filter((task) => task.status === options.status);
    if (options.isEnabled !== undefined) {
      tasks = tasks.filter((task) => task.enabled === options.isEnabled);
    }
    return tasks.slice(
      options.offset ?? 0,
      options.limit ? (options.offset ?? 0) + options.limit : undefined,
    );
  }

  async count(options: IScheduleTaskQueryOptions): Promise<number> {
    return (await this.query(options)).length;
  }

  async saveBatch(tasks: ScheduleTask[]): Promise<void> {
    for (const task of tasks) await this.save(task);
  }

  async deleteBatch(identityId: string, ids: string[]): Promise<void> {
    for (const id of ids) {
      const task = this.tasks.get(id);
      if (task && String(task.identityId) === identityId) this.tasks.delete(id);
    }
  }

  async withTransaction<T>(fn: (repo: IScheduleTaskRepository) => Promise<T>): Promise<T> {
    const working = new TransactionalInMemoryScheduleTaskRepository(this.all(), [
      ...this.receipts.values(),
    ]);
    const result = await fn(working);
    this.tasks = new Map(working.all().map((task) => [task.id, cloneTask(task)]));
    this.receipts = new Map(working.receipts);
    return result;
  }
}

function intentWithKey(suffix: string, runAtOffset = 0): ScheduledIntent {
  return {
    schedulingKey: buildSchedulingKey('fake-module', suffix),
    handlerKey: 'fake.fire',
    runAt: Date.UTC(2026, 7, 25, 12) + runAtOffset,
    payloadVersion: 1,
    payload: { suffix },
    sourceRevision: suffix,
  };
}

describe('LegacyScheduleTaskSchedulingAdapter', () => {
  it('lets a fake module reconcile through the neutral seam without ScheduleTask in its projection fixture', async () => {
    const repository = new TransactionalInMemoryScheduleTaskRepository();
    const port = createScheduleTaskSchedulingPort(repository);
    const projection = projectFakeModuleScheduling();

    const receipt = await port.reconcile(projection.owner, projection.desired);
    const [task] = await repository.findEnabled(projection.owner.identityId);
    const invocation = toScheduledInvocationContext(task!);

    expect(receipt).toMatchObject({
      status: 'succeeded',
      desiredCount: 1,
      createdCount: 1,
      updatedCount: 0,
      deletedCount: 0,
    });
    expect(task).toBeDefined();
    expect(task!.sourceModule).toBe(SourceModule.Custom);
    expect(task!.nextRunAt?.getTime()).toBe(projection.desired[0]!.runAt);
    expect(task!.retryPolicy.maxRetries).toBe(4);
    expect(task!.maxExecutions).toBeNull();
    expect(task!.metadata.priority).toBe('High');
    expect(invocation).toMatchObject({
      handlerKey: 'fake.fire',
      payloadVersion: 1,
      payload: { ownerId: 'fake-owner-1', message: 'hello' },
    });
    expect(repository.receiptCount).toBe(1);
    expect(repository.getReceipt(receipt.operationId)).toEqual(receipt);
  });

  it('reconciles the same desired invocation 100 times without duplicate persistence or invocation', async () => {
    const repository = new TransactionalInMemoryScheduleTaskRepository();
    const port = createScheduleTaskSchedulingPort(repository);
    const { owner, desired } = projectFakeModuleScheduling('repeat-owner');

    const receipts = [];
    for (let index = 0; index < 100; index += 1) {
      receipts.push(await port.reconcile(owner, desired));
    }

    const tasks = await repository.findEnabled(owner.identityId);
    expect(tasks).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ createdCount: 1, unchangedCount: 0 });
    expect(receipts.at(-1)).toMatchObject({ createdCount: 0, unchangedCount: 1 });

    const handler = vi.fn(async () => ({ status: 'succeeded' as const }));
    const registry = new ScheduledHandlerRegistry();
    registry.register({
      handlerKey: 'fake.fire',
      payloadVersion: 1,
      validatePayload: (payload: unknown) => payload,
      handler: { execute: handler },
    });
    const executor = createHandlerRegistryScheduleTaskSourceExecutor({ registry });
    await executor.execute(tasks[0]!);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dead-letters a raw legacy ScheduleTask that has no neutral scheduling envelope', async () => {
    const rawLegacyTask = ScheduleTask.create({
      identityId: 'IdentityId_legacy-owner',
      name: 'Legacy raw reminder worker job',
      sourceModule: SourceModule.Reminder,
      sourceEntityId: 'ReminderTemplateId_legacy',
      schedule: {
        cronExpression: null,
        timezone: 'Asia/Shanghai',
        startDate: new Date('2030-01-10T08:45:00.000Z').toISOString(),
        endDate: null,
        maxExecutions: 1,
      },
      metadata: {
        payload: { reminderId: 'ReminderTemplateId_legacy' },
        tags: ['legacy'],
        priority: 'Normal',
        timeout: null,
      },
    });
    const executor = createHandlerRegistryScheduleTaskSourceExecutor({
      registry: new ScheduledHandlerRegistry(),
    });

    await expect(executor.execute(rawLegacyTask)).resolves.toMatchObject({
      nextRunAt: null,
      disposition: 'dead_letter',
      result: {
        schedulingDisposition: 'dead_letter',
        schedulingFailureCode: 'MISSING_SCHEDULING_ENVELOPE',
      },
    });
  });

  it.each(['after-read', 'after-upsert', 'after-delete'] as const)(
    'rolls back the entire owner set when failure is injected at %s',
    async (failurePoint) => {
      const repository = new TransactionalInMemoryScheduleTaskRepository();
      const owner = {
        identityId: 'identity-1',
        type: 'fake-module',
        id: `rollback-${failurePoint}`,
      };
      const basePort = createScheduleTaskSchedulingPort(repository);
      await basePort.reconcile(owner, [intentWithKey('before')]);

      const options: ScheduleTaskSchedulingAdapterOptions = {
        failureInjector(point) {
          if (point === failurePoint) throw new Error(`injected ${point}`);
        },
      };
      const failingPort = createScheduleTaskSchedulingPort(repository, options);

      await expect(failingPort.reconcile(owner, [intentWithKey('after')])).rejects.toMatchObject({
        receipt: {
          status: 'failed',
          failure: { code: 'TRANSACTION_FAILED', retryable: true },
        },
      } satisfies Partial<SchedulingReconcileError>);

      const remaining = await repository.findEnabled(owner.identityId);
      expect(remaining).toHaveLength(1);
      expect(toScheduledInvocationContext(remaining[0]!)?.schedulingKey).toBe(
        intentWithKey('before').schedulingKey,
      );
      // Only the baseline successful reconcile has a durable receipt; the failed
      // owner transaction must roll back both mutations and its receipt append.
      expect(repository.receiptCount).toBe(1);
    },
  );

  it('serializes two concurrent reconciles for one owner so no mixed desired set survives', async () => {
    const repository = new TransactionalInMemoryScheduleTaskRepository();
    const port = createScheduleTaskSchedulingPort(repository);
    const owner = { identityId: 'identity-1', type: 'fake-module', id: 'concurrent-owner' };
    const first = [intentWithKey('a1'), intentWithKey('a2')];
    const second = [intentWithKey('b1'), intentWithKey('b2')];

    await Promise.all([port.reconcile(owner, first), port.reconcile(owner, second)]);

    const tasks = await repository.findEnabled(owner.identityId);
    const keys = tasks.map((task) => toScheduledInvocationContext(task)?.schedulingKey).sort();
    expect(keys).toEqual(second.map((intent) => intent.schedulingKey).sort());
  });

  it('rejects duplicate desired scheduling keys before writing', async () => {
    const repository = new TransactionalInMemoryScheduleTaskRepository();
    const port = createScheduleTaskSchedulingPort(repository);
    const owner = { identityId: 'identity-1', type: 'fake-module', id: 'duplicate-owner' };
    const intent = intentWithKey('duplicate');

    await expect(port.reconcile(owner, [intent, intent])).rejects.toMatchObject({
      receipt: {
        status: 'failed',
        failure: { code: 'DUPLICATE_SCHEDULING_KEY', retryable: false },
      },
    } satisfies Partial<SchedulingReconcileError>);
    expect(await repository.findEnabled(owner.identityId)).toHaveLength(0);
  });

  it('does not reuse a terminal scheduling key for a changed invocation', async () => {
    const repository = new TransactionalInMemoryScheduleTaskRepository();
    const port = createScheduleTaskSchedulingPort(repository);
    const owner = { identityId: 'identity-1', type: 'fake-module', id: 'terminal-owner' };
    const first = intentWithKey('terminal');
    await port.reconcile(owner, [first]);
    const [task] = await repository.findEnabled(owner.identityId);
    task!.complete();
    await repository.save(task!);

    await expect(
      port.reconcile(owner, [{ ...first, runAt: first.runAt + 10_000 }]),
    ).rejects.toMatchObject({
      receipt: {
        failure: { code: 'PERSISTED_KEY_COLLISION', retryable: false },
      },
    } satisfies Partial<SchedulingReconcileError>);
  });
});
