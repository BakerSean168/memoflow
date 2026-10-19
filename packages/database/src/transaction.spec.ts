import { describe, expect, it, vi } from 'vitest';
import type { Prisma, PrismaClient } from './generated/prisma/client.js';
import { withPrismaTransaction } from './transaction.js';

const TRANSACTION_SCOPE = Symbol.for('prisma.client.transaction.scope_context');

describe('withPrismaTransaction', () => {
  it('joins a caller-owned transaction instead of opening a nested one', async () => {
    const nested = vi.fn();
    const tx = { [TRANSACTION_SCOPE]: { kind: 'nested' }, $transaction: nested };
    const work = vi.fn(async (joined: unknown) => joined);

    await expect(
      withPrismaTransaction(
        tx as unknown as Prisma.TransactionClient,
        work as unknown as (client: Prisma.TransactionClient) => Promise<unknown>,
      ),
    ).resolves.toBe(tx);

    expect(work).toHaveBeenCalledWith(tx);
    expect(nested).not.toHaveBeenCalled();
  });

  it('opens one transaction for a root client and forwards the caller budget', async () => {
    const tx = {};
    const work = vi.fn(async () => 'done');
    const root = {
      $transaction: vi.fn(
        async (
          callback: (client: unknown) => Promise<unknown>,
          options?: { timeout?: number },
        ) => {
          expect(options).toEqual({ timeout: 15_000 });
          return callback(tx);
        },
      ),
    };

    await expect(
      withPrismaTransaction(
        root as unknown as PrismaClient,
        work as unknown as (client: Prisma.TransactionClient) => Promise<string>,
        { timeout: 15_000 },
      ),
    ).resolves.toBe('done');
    expect(root.$transaction).toHaveBeenCalledTimes(1);
  });
});
