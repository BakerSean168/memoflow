import { describe, expect, it, vi } from 'vitest';
import type {
  IElectronDatabase,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import { SourceModule, Timezone } from '@memoflow/contracts/schedule';
import { ScheduleTask } from '../../../../domain/aggregates/schedule-task';
import { ScheduleConfig } from '../../../../domain/value-objects';
import { PowerSyncScheduleTaskRepository } from '../schedule-task-powersync.repository';

function createTransactionMock(): IElectronDatabaseTransaction & {
  execute: ReturnType<typeof vi.fn>;
  getAll: ReturnType<typeof vi.fn>;
  getOptional: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
} {
  return {
    execute: vi.fn(async () => ({ rowsAffected: 1 })),
    getAll: vi.fn(async () => []),
    getOptional: vi.fn(async () => null),
    get: vi.fn(async () => {
      throw new Error('not configured');
    }),
  };
}

function createDatabaseMock(tx: IElectronDatabaseTransaction): IElectronDatabase & {
  writeTransaction: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  getAll: ReturnType<typeof vi.fn>;
  getOptional: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
} {
  return {
    execute: vi.fn(async () => {
      throw new Error('root execute must not be used inside owner transaction');
    }),
    getAll: vi.fn(async () => {
      throw new Error('root getAll must not be used inside owner transaction');
    }),
    getOptional: vi.fn(async () => {
      throw new Error('root getOptional must not be used inside owner transaction');
    }),
    get: vi.fn(async () => {
      throw new Error('root get must not be used inside owner transaction');
    }),
    writeTransaction: vi.fn(async <T>(callback: (transaction: IElectronDatabaseTransaction) => Promise<T>) =>
      callback(tx),
    ),
  };
}

function createTask(): ScheduleTask {
  const task = ScheduleTask.create({
    identityId: 'identity-1',
    name: 'PowerSync transaction task',
    sourceModule: SourceModule.Custom,
    sourceEntityId: 'owner-1',
    schedule: ScheduleConfig.create({
      cronExpression: null,
      timezone: Timezone.Utc,
      startDate: new Date(Date.now() + 60_000).toISOString(),
      endDate: null,
      maxExecutions: null,
    }),
  });
  task.clearDomainEvents();
  return task;
}

describe('PowerSyncScheduleTaskRepository owner transactions', () => {
  it('routes reads through the transaction handle and never the root database', async () => {
    const tx = createTransactionMock();
    tx.getOptional.mockResolvedValue({ count: 2 });
    const db = createDatabaseMock(tx);
    const repository = new PowerSyncScheduleTaskRepository(db);

    const count = await repository.withTransaction((txRepository) =>
      txRepository.count({ identityId: 'identity-1' }),
    );

    expect(count).toBe(2);
    expect(db.writeTransaction).toHaveBeenCalledTimes(1);
    expect(tx.getOptional).toHaveBeenCalledTimes(1);
    expect(db.getOptional).not.toHaveBeenCalled();
  });

  it('saves through the existing transaction without opening a nested write transaction', async () => {
    const tx = createTransactionMock();
    const db = createDatabaseMock(tx);
    const repository = new PowerSyncScheduleTaskRepository(db);
    const task = createTask();

    await repository.withTransaction(async (txRepository) => {
      await txRepository.save(task);
      await txRepository.withTransaction(async (nestedRepository) => {
        expect(nestedRepository).toBe(txRepository);
      });
    });

    expect(db.writeTransaction).toHaveBeenCalledTimes(1);
    expect(tx.execute).toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('propagates callback failures from the database transaction boundary', async () => {
    const tx = createTransactionMock();
    const db = createDatabaseMock(tx);
    const repository = new PowerSyncScheduleTaskRepository(db);

    await expect(
      repository.withTransaction(async () => {
        throw new Error('injected owner reconcile failure');
      }),
    ).rejects.toThrow('injected owner reconcile failure');

    expect(db.writeTransaction).toHaveBeenCalledTimes(1);
  });
});
