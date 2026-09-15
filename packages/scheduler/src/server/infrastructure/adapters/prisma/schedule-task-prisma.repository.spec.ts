import type { PrismaClient } from '@memoflow/database';
import { describe, expect, it, vi } from 'vitest';

import { ScheduleTaskPrismaRepository } from './schedule-task-prisma.repository';

function createRepositoryWithTransaction(
  transaction: (callback: (tx: unknown) => Promise<unknown>, options?: unknown) => Promise<unknown>,
): ScheduleTaskPrismaRepository {
  const db = {
    scheduleTask: {},
    scheduleExecution: {},
    schedulingReconcileOperation: {},
    $transaction: transaction,
  } as unknown as PrismaClient;
  return new ScheduleTaskPrismaRepository(db);
}

describe('ScheduleTaskPrismaRepository Serializable transaction retry', () => {
  it('retries Prisma P2034 conflicts with a fresh transaction callback and returns the committed result', async () => {
    const tx = {
      scheduleTask: {},
      scheduleExecution: {},
      schedulingReconcileOperation: {},
    };
    const transaction = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('write conflict'), { code: 'P2034' }))
      .mockImplementationOnce(async (callback: (client: unknown) => Promise<unknown>) => callback(tx));
    const repository = createRepositoryWithTransaction(transaction);
    const work = vi.fn(async () => 'committed');

    await expect(repository.withTransaction(work)).resolves.toBe('committed');
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-conflict failures', async () => {
    const failure = Object.assign(new Error('constraint failed'), { code: 'P2002' });
    const transaction = vi.fn().mockRejectedValue(failure);
    const repository = createRepositoryWithTransaction(transaction);

    await expect(repository.withTransaction(async () => 'never')).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('stops after the bounded number of P2034 attempts', async () => {
    const failure = Object.assign(new Error('write conflict'), { code: 'P2034' });
    const transaction = vi.fn().mockRejectedValue(failure);
    const repository = createRepositoryWithTransaction(transaction);

    await expect(repository.withTransaction(async () => 'never')).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(3);
  });
});
