import type { PrismaClient } from '@memoflow/database';
import type { IWalletRepository, WalletAccountDTO, WalletTransactionDTO } from '../../../domain';
import { PrismaWalletMapper } from './mappers/prisma-wallet.mapper';
import { WalletAccountNotFoundError } from '../../../domain/errors/wallet-account-not-found-error';

/**
 * Prisma 钱包仓储（R7）/ Prisma wallet repository (R7).
 *
 * 保留默认 currency `CNY`、所有 Decimal 字段 `.toString()`、所有 Date 字段
 * `.getTime()`；`recordTransaction` 保持单个 `db.$transaction`：先按
 * `{ id: accountId, identityId }` 查账户，缺失抛 `WalletAccountNotFoundError`
 * （结构化错误，非裸消息文本），再按 `income/expense/transfer` delta 规则更新
 * 余额并创建交易。
 * Keeps the default `CNY` currency, `.toString()` on all Decimal fields,
 * `.getTime()` on all Date fields, and `recordTransaction` inside one
 * `db.$transaction`: find the account by `{ id: accountId, identityId }`,
 * throw `WalletAccountNotFoundError` when missing, then update the balance by the
 * `income/expense/transfer` delta rule and insert the transaction.
 */
export class WalletPrismaRepository implements IWalletRepository {
  constructor(private readonly db: PrismaClient) {}

  /** 创建账户（默认 currency CNY）/ Creates an account with default currency CNY. */
  async createAccount(input: {
    identityId: string;
    name: string;
    currency?: string;
  }): Promise<WalletAccountDTO> {
    const row = await this.db.walletAccount.create({
      data: {
        id: crypto.randomUUID(),
        identityId: input.identityId,
        name: input.name,
        currency: input.currency ?? 'CNY',
      },
    });
    return PrismaWalletMapper.toAccountDTO(row);
  }

  /** 按身份列出账户（createdAt ASC）/ Lists accounts by identity ordered by createdAt ASC. */
  async listAccounts(identityId: string): Promise<WalletAccountDTO[]> {
    const rows = await this.db.walletAccount.findMany({
      where: { identityId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => PrismaWalletMapper.toAccountDTO(r));
  }

  /** 记账（单事务：查账户 → 更新余额 → 写交易）/ Records a transaction in one db transaction. */
  async recordTransaction(input: {
    identityId: string;
    accountId: string;
    type: 'income' | 'expense' | 'transfer';
    amount: string;
    category?: string | null;
    note?: string | null;
    goalId?: string | null;
    occurredAt?: number;
  }): Promise<WalletTransactionDTO> {
    return this.db.$transaction(async (tx) => {
      const account = await tx.walletAccount.findFirst({
        where: { id: input.accountId, identityId: input.identityId },
      });
      if (!account) {
        throw new WalletAccountNotFoundError();
      }
      const delta = input.type === 'income' ? input.amount : `-${input.amount}`;
      await tx.walletAccount.update({
        where: { id: account.id },
        data: { balance: { increment: delta } },
      });
      const row = await tx.walletTransaction.create({
        data: {
          id: crypto.randomUUID(),
          accountId: input.accountId,
          identityId: input.identityId,
          type: input.type,
          amount: input.amount,
          category: input.category ?? null,
          note: input.note ?? null,
          goalId: input.goalId ?? null,
          occurredAt: new Date(input.occurredAt ?? Date.now()),
        },
      });
      return PrismaWalletMapper.toTransactionDTO(row);
    });
  }

  /** 按身份列出交易（occurredAt DESC，limit 默认 50）/ Lists transactions by identity ordered by occurredAt DESC. */
  async listTransactions(identityId: string, limit?: number): Promise<WalletTransactionDTO[]> {
    const rows = await this.db.walletTransaction.findMany({
      where: { identityId },
      orderBy: { occurredAt: 'desc' },
      take: limit ?? 50,
    });
    return rows.map((r) => PrismaWalletMapper.toTransactionDTO(r));
  }
}
