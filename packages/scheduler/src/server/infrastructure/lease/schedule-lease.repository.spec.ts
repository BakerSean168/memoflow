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

describe('createScheduleLeasePrismaRepository', () => {
  it('projects a concurrent P2002 lease race to not-acquired', async () => {
    const transactionLease = {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => {
        throw Object.assign(new Error('unique lease race'), { code: 'P2002' });
      }),
    };
    const db = {
      $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work({ scheduleLease: transactionLease }),
      ),
    };

    const repository = createScheduleLeasePrismaRepository(db as never);

    await expect(repository.tryAcquire(request())).resolves.toBe(false);
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
