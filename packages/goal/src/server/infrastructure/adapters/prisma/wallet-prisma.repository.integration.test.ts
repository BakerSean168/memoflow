import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../../__tests__/integration-helpers';
import type { PrismaClient } from '@memoflow/database';
import { WalletPrismaRepository } from './wallet-prisma.repository';

async function seedIdentity(): Promise<string> {
  const identityId = IdentityId.generate();
  await seedAccount({ id: identityId });
  return identityId;
}

describe('WalletPrismaRepository integration (R7)', () => {
  let db: PrismaClient;
  let repository: WalletPrismaRepository;

  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanAll();
    db = await getPrisma();
    repository = new WalletPrismaRepository(db);
  });

  it('creates an account with a default CNY currency and zero balance', async () => {
    const identityId = await seedIdentity();

    const account = await repository.createAccount({ identityId, name: '日常' });

    expect(account).toMatchObject({ name: '日常', currency: 'CNY', balance: '0' });
    expect(account.id).toBeTruthy();
  });

  it('scopes accounts by identityId', async () => {
    const identityId = await seedIdentity();
    const otherIdentityId = await seedIdentity();

    await repository.createAccount({ identityId, name: 'A' });
    await repository.createAccount({ identityId: otherIdentityId, name: 'Foreign' });

    const accounts = await repository.listAccounts(identityId);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.name).toBe('A');
  });

  it('records an income and updates the balance with Decimal precision', async () => {
    const identityId = await seedIdentity();
    const account = await repository.createAccount({ identityId, name: 'A' });

    const tx = await repository.recordTransaction({
      identityId,
      accountId: account.id,
      type: 'income',
      amount: '1234.5678901234',
      category: 'salary',
      note: 'Jan',
      goalId: 'goal-1',
      occurredAt: 1_700_000_000_000,
    });

    expect(tx).toMatchObject({
      accountId: account.id,
      type: 'income',
      amount: '1234.5678901234',
      category: 'salary',
      note: 'Jan',
      goalId: 'goal-1',
      occurredAt: 1_700_000_000_000,
    });

    const reloaded = await repository.listAccounts(identityId);
    expect(reloaded[0]?.balance).toBe('1234.5678901234');
  });

  it('decrements the balance for an expense', async () => {
    const identityId = await seedIdentity();
    const account = await repository.createAccount({ identityId, name: 'A' });

    await repository.recordTransaction({
      identityId,
      accountId: account.id,
      type: 'income',
      amount: '100',
    });
    await repository.recordTransaction({
      identityId,
      accountId: account.id,
      type: 'expense',
      amount: '40.5',
    });

    const reloaded = await repository.listAccounts(identityId);
    expect(reloaded[0]?.balance).toBe('59.5');
  });

  it('orders transactions by occurredAt DESC', async () => {
    const identityId = await seedIdentity();
    const account = await repository.createAccount({ identityId, name: 'A' });

    await repository.recordTransaction({
      identityId,
      accountId: account.id,
      type: 'income',
      amount: '1',
      occurredAt: 1_000,
    });
    await repository.recordTransaction({
      identityId,
      accountId: account.id,
      type: 'income',
      amount: '2',
      occurredAt: 2_000,
    });

    const transactions = await repository.listTransactions(identityId);

    expect(transactions.map((t) => t.amount)).toEqual(['2', '1']);
  });

  it('wraps balance update + transaction insert in a single db transaction', async () => {
    const identityId = await seedIdentity();
    const account = await repository.createAccount({ identityId, name: 'A' });

    let txCount = 0;
    const spied = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === '$transaction') {
          return async (cb: (tx: PrismaClient) => Promise<unknown>) => {
            txCount += 1;
            return target.$transaction(cb);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as unknown as PrismaClient;
    const spiedRepo = new WalletPrismaRepository(spied);

    await spiedRepo.recordTransaction({
      identityId,
      accountId: account.id,
      type: 'income',
      amount: '10',
    });

    expect(txCount).toBe(1);
  });

  it('throws ACCOUNT_NOT_FOUND and persists nothing when the account is missing', async () => {
    const identityId = await seedIdentity();

    await expect(
      repository.recordTransaction({
        identityId,
        accountId: 'missing-account',
        type: 'income',
        amount: '10',
      }),
    ).rejects.toThrow('ACCOUNT_NOT_FOUND');

    expect(await db.walletTransaction.count({ where: { identityId } })).toBe(0);
  });

  it('rolls back the balance when the transaction insert fails (atomicity)', async () => {
    const identityId = await seedIdentity();
    const account = await repository.createAccount({ identityId, name: 'A' });

    await expect(
      repository.recordTransaction({
        identityId,
        accountId: account.id,
        type: 'income',
        amount: '100',
        occurredAt: NaN,
      }),
    ).rejects.toThrow();

    const reloaded = await repository.listAccounts(identityId);
    expect(reloaded[0]?.balance).toBe('0');
    expect(await db.walletTransaction.count({ where: { identityId } })).toBe(0);
  });
});
