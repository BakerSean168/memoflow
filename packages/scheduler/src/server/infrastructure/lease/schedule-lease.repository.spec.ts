import { describe, expect, it, vi } from 'vitest';
import { createScheduleLeasePrismaRepository } from './schedule-lease.repository';

function request() {
  const now = Date.now();
  return {
    leaseKey: 'schedule-host',
    ownerToken: 'owner-a',
    now,
    expiresAt: now + 60_000,
  };
}

function createDb(insertedCount: number) {
  const transactionLease = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    createMany: vi.fn(async () => ({ count: insertedCount })),
  };
  const db = {
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work({ scheduleLease: transactionLease }),
    ),
  };
  return { db, transactionLease };
}

describe('createScheduleLeasePrismaRepository', () => {
  it('acquires the lease when the conflict-free insert wins', async () => {
    const { db, transactionLease } = createDb(1);
    const repository = createScheduleLeasePrismaRepository(db as never);

    await expect(repository.tryAcquire(request())).resolves.toBe(true);
    expect(transactionLease.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('projects a concurrent duplicate lease insert to not-acquired without exception control flow', async () => {
    const { db, transactionLease } = createDb(0);
    const repository = createScheduleLeasePrismaRepository(db as never);

    await expect(repository.tryAcquire(request())).resolves.toBe(false);
    expect(transactionLease.createMany).toHaveBeenCalledTimes(1);
  });

  it('does not hide unexpected lease repository failures', async () => {
    const failure = new Error('database unavailable');
    const db = {
      $transaction: vi.fn(async () => {
        throw failure;
      }),
    };
    const repository = createScheduleLeasePrismaRepository(db as never);

    await expect(repository.tryAcquire(request())).rejects.toBe(failure);
  });
});
